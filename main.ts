// @ts-nocheck
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', '生成实验结果汇总', async (_evt: MouseEvent) => {
			// 点击图标也触发生成汇总，与命令行为一致
			try {
				await this.writeDebugLog('Ribbon clicked, start collectExperimentResults');
				await this.collectExperimentResults();
			} catch (e) {
				console.error('collectExperimentResults error', e);
				await this.writeDebugLog(`collectExperimentResults error (ribbon): ${e && e.stack ? e.stack : String(e)}`);
				new Notice('生成实验结果失败，请查看控制台');
			}
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});

		// 添加：生成实验结果汇总命令
		this.addCommand({
			id: 'collect-experiment-results',
			name: '生成实验结果汇总页',
			callback: async () => {
				try {
					await this.writeDebugLog('Command executed: collectExperimentResults');
					await this.collectExperimentResults();
				} catch (e) {
					console.error('collectExperimentResults error', e);
					await this.writeDebugLog(`collectExperimentResults error (command): ${e && e.stack ? e.stack : String(e)}`);
					new Notice('生成实验结果失败，请查看控制台');
				}
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	/**
	 * 将调试信息写入 Vault 根目录下的实验调试日志文件，便于在无法查看控制台时排查问题
	 */
	private async writeDebugLog(text: string) {
		const fileName = 'experiment-collector-debug.log';
		const time = new Date().toISOString();
		const content = `=== ${time} ===\n${text}\n\n`;
		try {
			const existing = this.app.vault.getAbstractFileByPath(fileName);
			if (existing && (existing as any).instanceof && existing instanceof (await import('obsidian')).TFile) {
				// append by reading then modifying
				const data = await this.app.vault.read(existing as any);
				await this.app.vault.modify(existing as any, data + content);
			} else if (existing && existing instanceof (await import('obsidian')).TFile) {
				const data = await this.app.vault.read(existing as any);
				await this.app.vault.modify(existing as any, data + content);
			} else {
				await this.app.vault.create(fileName, content);
			}
		} catch (e) {
			// 如果写日志也失败，则在控制台记录
			console.error('writeDebugLog failed', e);
		}
	}

	/**
	 * 递归收集 folder 下的所有 md 文件
	 */
    private async collectMarkdownFiles(folder: any): Promise<any[]> {
        const files: any[] = [];
        if (!folder.children) return files;

        for (const child of folder.children) {
            // 判断是否是文件夹（用 children 属性代替 instanceof）
            if (child.children && Array.isArray(child.children)) {
                files.push(...await this.collectMarkdownFiles(child));
            } 
            // 判断是否是 md 文件
            else if (child.path && typeof child.path === 'string' && child.path.endsWith('.md')) {
                files.push(child);
            }
        }
        return files;
    }

	/**
	 * 生成并写入两份汇总文件
	 */
    async collectExperimentResults() {
        await this.writeDebugLog('collectExperimentResults started');

        const resultFileName = '📊实验结果汇总.md';
        const taskFileName = '📝任务列表汇总.md';
        const modelsPath = 'models';

        // 获取 models 文件夹
        const folder = this.app.vault.getAbstractFileByPath(modelsPath);
        await this.writeDebugLog(`modelsFolder: ${folder?.path}, hasChildren: ${folder && 'children' in folder}`);

        if (!folder || !('children' in folder)) {
            new Notice('未找到 models 文件夹，跳过生成');
            await this.writeDebugLog('models folder not found or has no children, aborting');
            return;
        }

        // 收集所有 md 文件
        let mdFiles: import('obsidian').TFile[] = [];
        try {
            mdFiles = await this.collectMarkdownFiles(folder as any);
            await this.writeDebugLog(`Total markdown files found: ${mdFiles.length}`);
        } catch (e) {
            await this.writeDebugLog('collectMarkdownFiles failed: ' + (e.stack || e));
            new Notice('收集 Markdown 文件失败 ❌');
            return;
        }

        // 按 model / exp 分组
        const grouped: Record<string, { exp: string; path: string }[]> = {};
        for (const file of mdFiles) {
            try {
                const parts = file.path.split('/');
                await this.writeDebugLog(`processing file: ${file.path}, parts length: ${parts.length}`);
                if (parts.length < 3) continue;

                const model = parts[1];
                const exp = parts.slice(2).join('/').replace(/\.md$/i, '');
                if (!grouped[model]) grouped[model] = [];
                grouped[model].push({ exp, path: file.path });
            } catch (e) {
                await this.writeDebugLog('Error processing file: ' + file.path + ', ' + (e.stack || e));
            }
        }

        // 生成实验结果内容
        const makeResultContent = (): string => {
            let result = '## 点云分割结果\n\n';
            for (const model of Object.keys(grouped).sort()) {
                result += `### 🤖${model}\n\n`;
                for (const { exp, path } of grouped[model].sort((a, b) => a.exp.localeCompare(b.exp))) {
                    result += `###### 🧪${exp}\n\n`;
                    result += `![[${path}#实验结果：]]\n\n`;
                }
                result += '---\n\n';
            }
            return result;
        };

        // 生成后续任务内容
        const makeTaskContent = (): string => {
            let result = '## 点云分割后续任务\n\n';
            for (const model of Object.keys(grouped).sort()) {
                result += `## 🤖${model} 后续任务\n\n`;
                for (const { exp, path } of grouped[model].sort((a, b) => a.exp.localeCompare(b.exp))) {
                    result += `###### 🧪${exp}\n\n`;
                    result += `![[${path}#后续任务]]\n\n`;
                }
                result += '---\n\n';
            }
            return result;
        };

        // 写文件函数
        const writeFile = async (fileName: string, content: string) => {
            try {
                const existing = this.app.vault.getAbstractFileByPath(fileName);
                if (existing && 'path' in existing) {
                    await this.app.vault.modify(existing as import('obsidian').TFile, content);
                    await this.writeDebugLog(`Modified existing file: ${fileName}`);
                } else {
                    await this.app.vault.create(fileName, content);
                    await this.writeDebugLog(`Created new file: ${fileName}`);
                }
            } catch (e) {
                await this.writeDebugLog(`writeFile ${fileName} failed: ${e.stack || e}`);
            }
        };

        // 执行写入
        await writeFile(resultFileName, makeResultContent());
        await writeFile(taskFileName, makeTaskContent());

        new Notice('实验结果和任务列表汇总完成 ✅');
        await this.writeDebugLog('collectExperimentResults finished successfully');
    }


	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
