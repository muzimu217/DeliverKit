/**
 * Sample TypeScript Project
 * ForgeKit 测试用示例项目
 */

const PORT = process.env.PORT || 3000;

interface ServerInfo {
  name: string;
  version: string;
  port: number;
}

class SampleApp {
  private info: ServerInfo;

  constructor() {
    this.info = {
      name: 'sample-typescript-project',
      version: '1.0.0',
      port: PORT,
    };
  }

  getInfo(): ServerInfo {
    return this.info;
  }

  greet(name: string = 'World'): string {
    return `Hello, ${name}!`;
  }
}

// 主程序入口
const app = new SampleApp();
console.log(app.greet());
console.log('Server info:', app.getInfo());
console.log('TypeScript sample project is running!');