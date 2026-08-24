#!/usr/bin/env node

/**
 * DeliverKit CLI
 *
 * 当前提供 inspect/plan 规划命令与 Linux/Windows/macOS/HarmonyOS 构建、编排命令：
 * - deliverkit inspect [source]      识别项目与交付目标建议
 * - deliverkit plan [source] --goals 生成 Forge.md 交付契约
 *
 */

import { Command } from 'commander';
import { inspectProject } from '../capabilities/inspect-project.js';
import { generatePackagingPlan } from '../capabilities/generate-packaging-plan.js';
import { packDeb } from '../capabilities/pack-deb.js';
import { packRpm } from '../capabilities/pack-rpm.js';
import { packAppImage } from '../capabilities/pack-appimage.js';
import { generateCiWorkflow } from '../capabilities/generate-ci-workflow.js';
import { packWindowsMsi } from '../capabilities/pack-windows-msi.js';
import { packMacos } from '../capabilities/pack-macos.js';
import { packHarmonyos } from '../capabilities/pack-harmonyos.js';
import { generateReleaseManifest } from '../capabilities/generate-release-manifest.js';

const program = new Command();

interface PlanCliOptions {
  goals?: string;
  env?: string;
}

interface PackDebCliOptions {
  output?: string;
  name?: string;
}

interface GenerateCiCliOptions {
  output?: string;
  overwrite?: boolean;
}

program
  .name('deliverkit')
  .description('AI 交付大脑：规划一个产品到各生态的合法交付链路')
  .version('0.1.0');

program
  .command('inspect')
  .description('识别项目语言、入口与已有打包配置，给出跨生态交付目标建议')
  .argument('[source]', 'project directory', '.')
  .action(async (source: string) => {
    const result = await inspectProject(source);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'success') {
      process.exitCode = 1;
    }
  });

program
  .command('plan')
  .description('生成 Forge.md 交付契约（目标生态 / 产物 / 决策 / 风险）')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--goals <list>', '目标产物列表，逗号分隔，例如 deb,rpm 或 windows-msi')
  .option('--env <environment>', '目标环境，例如 ubuntu-22.04、windows、macos、harmonyos')
  .action(async (source: string, options: PlanCliOptions) => {
    const goals = (options.goals ?? '')
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
    if (goals.length === 0) {
      program.error('--goals 不能为空');
    }
    const result = await generatePackagingPlan(source, goals, options.env);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'success') {
      process.exitCode = 1;
    }
  });

program
  .command('pack-deb')
  .description('按 Forge.md 在隔离 Ubuntu 容器中构建 deb 包，并执行干净容器安装/运行验证')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--name <package>', 'Debian 包名，默认使用项目名')
  .action((source: string, options: PackDebCliOptions & { plan: string }) => {
    const result = packDeb({
      sourceDir: source,
      planPath: options.plan,
      outputDir: options.output,
      packageName: options.name,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'success') {
      process.exitCode = 1;
    }
  });

program
  .command('pack-rpm')
  .description('按 Forge.md 在隔离 Rocky Linux 容器中构建 rpm 包，并执行干净容器安装/运行验证')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--name <package>', 'RPM 包名，默认使用项目名')
  .action((source: string, options: PackDebCliOptions & { plan: string }) => {
    const result = packRpm({
      sourceDir: source,
      planPath: options.plan,
      outputDir: options.output,
      packageName: options.name,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'success') {
      process.exitCode = 1;
    }
  });

program
  .command('pack-appimage')
  .description('按 Forge.md 在隔离 Ubuntu x86_64 容器中构建 AppImage，并执行 extract-and-run 验证')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--name <package>', 'AppImage 名称，默认使用项目名')
  .action((source: string, options: PackDebCliOptions & { plan: string }) => {
    const result = packAppImage({ sourceDir: source, planPath: options.plan, outputDir: options.output, packageName: options.name });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'success') {process.exitCode = 1;}
  });

program
  .command('generate-ci-workflow')
  .description('按 Forge.md 生成 GitHub Actions Linux/Windows 多平台交付工作流')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '工作流输出路径，默认 <source>/.github/workflows/deliverkit.yml')
  .option('--overwrite', '允许覆盖已存在的工作流')
  .action((source: string, options: GenerateCiCliOptions & { plan: string }) => {
    const result = generateCiWorkflow({ sourceDir: source, planPath: options.plan, outputPath: options.output, overwrite: options.overwrite });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'success') {process.exitCode = 1;}
  });

program
  .command('pack-windows-msi')
  .description('在 Windows runner 使用 WiX 构建、签名并验证 MSI')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--name <package>', 'MSI 名称，默认使用项目名')
  .action((source: string, options: PackDebCliOptions & { plan: string }) => {
    const result = packWindowsMsi({ sourceDir: source, planPath: options.plan, outputDir: options.output, packageName: options.name });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'success') {process.exitCode = 1;}
  });

program
  .command('pack-macos')
  .description('在 macOS runner 构建、签名、公证并验证 DMG/PKG')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--name <package>', 'DMG/PKG 名称，默认使用项目名')
  .option('--artifact <type>', '产物类型：dmg 或 pkg；缺省按 Forge.md 选择')
  .action((source: string, options: PackDebCliOptions & { plan: string; artifact?: 'dmg' | 'pkg' }) => {
    const result = packMacos({ sourceDir: source, planPath: options.plan, outputDir: options.output, packageName: options.name, artifact: options.artifact });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'success') {process.exitCode = 1;}
  });

program
  .command('pack-harmonyos')
  .description('在 DevEco runner 构建并使用 hdc 安装验证 HarmonyOS HAP/APP')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--artifact <type>', '产物类型：hap 或 app；缺省按 Forge.md 选择')
  .action((source: string, options: PackDebCliOptions & { plan: string; artifact?: 'hap' | 'app' }) => {
    const result = packHarmonyos({ sourceDir: source, planPath: options.plan, outputDir: options.output, artifact: options.artifact });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'success') {process.exitCode = 1;}
  });

program
  .command('generate-release-manifest')
  .description('汇总各平台 JSON 结果并生成 ReleaseManifest.json')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--results <path>', '平台结果 JSON 目录，默认 <source>/.deliverkit/results')
  .option('--output <path>', '报告输出路径，默认 <source>/ReleaseManifest.json')
  .action((source: string, options: { plan: string; results?: string; output?: string }) => {
    const result = generateReleaseManifest({ sourceDir: source, planPath: options.plan, resultsDir: options.results, outputPath: options.output });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'success') {process.exitCode = 1;}
  });

program.parseAsync(process.argv).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
