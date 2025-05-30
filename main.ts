import { App, Plugin } from 'obsidian';
import ObsigentPluginCore from './src/main';

// Main plugin class for Obsidian
export default class ObsigentObsidianPlugin extends Plugin {
  core: ObsigentPluginCore;

  async onload() {
    console.log('Loading Obsidian Obsigent Plugin');
    this.core = new ObsigentPluginCore(this);
    await this.core.onload();
  }

  onunload() {
    console.log('Unloading Obsidian Obsigent Plugin');
    if (this.core) {
      this.core.onunload();
    }
  }
}
