#!/usr/bin/env node

/**
 * DeliverKit CLI
 *
 * 规划命令（inspect/plan）、构建命令（pack-*）、编排命令（generate-*）
 * 与环境自检（doctor）。默认输出人类可读摘要，--json 输出结构化结果。
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
import type { ForgeKitResult } from '../capabilities/types.js';
import { emitResult } from './render.js';
import { renderDoctorReport, runDoctor } from './doctor.js';

const program = new Command();

interface JsonOption {
  json?: boolean;
}

interface PlanCliOptions extends JsonOption {
  goals?: string;
  env?: string;
  language?: string;
  entry?: string[];
}

interface PackCliOptions extends JsonOption {
  output?: string;
  name?: string;
  version?: string;
}

interface GenerateCiCliOptions extends JsonOption {
  output?: string;
  overwrite?: boolean;
}

/** 所有命令共用的收尾：渲染结果并按 status 设置退出码。 */
function finish(result: ForgeKitResult, options: JsonOption): void {
  emitResult(result, { json: options.json });
  if (result.status !== 'success') {
    process.exitCode = 1;
  }
}

program
  .name('deliverkit')
  .description('AI 交付大脑：规划一个产品到各生态的合法交付链路')
  .version('0.3.0');

program
  .command('doctor')
  .description('自检本机现在能交付哪些目标，缺什么、怎么补')
  .option('--json', '输出结构化 JSON')
  .action((options: JsonOption) => {
    const report = runDoctor();
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return;
    }
    process.stdout.write(`${renderDoctorReport(report)}\n`);
  });

program
  .command('inspect')
  .description('识别项目语言、入口与已有打包配置，给出跨生态交付目标建议')
  .argument('[source]', 'project directory', '.')
  .option('--language <lang>', '手动指定语言（python/javascript/typescript/go/arkts），识别失败时使用')
  .option('--entry <path>', '手动指定入口，可重复；文件须存在于项目内，脚本型入口可用 npm start', (value: string, previous: string[]) => [...previous, value], [])
  .option('--json', '输出结构化 JSON')
  .action(async (source: string, options: PlanCliOptions) => {
    finish(await inspectProject(source, { language: options.language, entrypoints: options.entry }), options);
  });

program
  .command('plan')
  .description('生成 Forge.md 交付契约（目标生态 / 产物 / 决策 / 风险）')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--goals <list>', '目标产物列表，逗号分隔，例如 deb,rpm 或 windows-msi')
  .option('--env <environment>', '目标环境，例如 ubuntu-22.04、windows、macos、harmonyos')
  .option('--language <lang>', '手动指定语言（python/javascript/typescript/go/arkts），识别失败时使用')
  .option('--entry <path>', '手动指定入口，可重复；文件须存在于项目内，脚本型入口可用 npm start', (value: string, previous: string[]) => [...previous, value], [])
  .option('--json', '输出结构化 JSON')
  .action(async (source: string, options: PlanCliOptions) => {
    const goals = (options.goals ?? '')
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
    if (goals.length === 0) {
      program.error('--goals 不能为空');
    }
    finish(
      await generatePackagingPlan(source, goals, options.env, {
        language: options.language,
        entrypoints: options.entry,
      }),
      options
    );
  });

program
  .command('pack-deb')
  .description('按 Forge.md 在隔离 Ubuntu 容器中构建 deb 包，并执行干净容器安装/运行验证')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--name <package>', 'Debian 包名，默认使用项目名')
  .option('--version <version>', '产物版本，默认取项目元数据（package.json/pyproject.toml），回退 0.1.0')
  .option('--json', '输出结构化 JSON')
  .action((source: string, options: PackCliOptions & { plan: string }) => {
    finish(packDeb({
      sourceDir: source,
      planPath: options.plan,
      outputDir: options.output,
      packageName: options.name,
      packageVersion: options.version,
    }), options);
  });

program
  .command('pack-rpm')
  .description('按 Forge.md 在隔离 Rocky Linux 容器中构建 rpm 包，并执行干净容器安装/运行验证')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--name <package>', 'RPM 包名，默认使用项目名')
  .option('--version <version>', '产物版本，默认取项目元数据（package.json/pyproject.toml），回退 0.1.0')
  .option('--json', '输出结构化 JSON')
  .action((source: string, options: PackCliOptions & { plan: string }) => {
    finish(packRpm({
      sourceDir: source,
      planPath: options.plan,
      outputDir: options.output,
      packageName: options.name,
      packageVersion: options.version,
    }), options);
  });

program
  .command('pack-appimage')
  .description('按 Forge.md 在隔离 Ubuntu x86_64 容器中构建 AppImage，并执行 extract-and-run 验证')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--name <package>', 'AppImage 名称，默认使用项目名')
  .option('--version <version>', '产物版本，默认取项目元数据（package.json/pyproject.toml），回退 0.1.0')
  .option('--json', '输出结构化 JSON')
  .action((source: string, options: PackCliOptions & { plan: string }) => {
    finish(packAppImage({ sourceDir: source, planPath: options.plan, outputDir: options.output, packageName: options.name, packageVersion: options.version }), options);
  });

program
  .command('generate-ci-workflow')
  .description('按 Forge.md 生成 GitHub Actions 多平台交付工作流')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '工作流输出路径，默认 <source>/.github/workflows/deliverkit.yml')
  .option('--overwrite', '允许覆盖已存在的工作流')
  .option('--json', '输出结构化 JSON')
  .action((source: string, options: GenerateCiCliOptions & { plan: string }) => {
    finish(generateCiWorkflow({ sourceDir: source, planPath: options.plan, outputPath: options.output, overwrite: options.overwrite }), options);
  });

program
  .command('pack-windows-msi')
  .description('在 Windows runner 使用 WiX 构建、签名并验证 MSI')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--name <package>', 'MSI 名称，默认使用项目名')
  .option('--version <version>', '产物版本，默认取项目元数据（package.json/pyproject.toml），回退 0.1.0')
  .option('--json', '输出结构化 JSON')
  .action((source: string, options: PackCliOptions & { plan: string }) => {
    finish(packWindowsMsi({ sourceDir: source, planPath: options.plan, outputDir: options.output, packageName: options.name, packageVersion: options.version }), options);
  });

program
  .command('pack-macos')
  .description('在 macOS runner 构建、签名、公证并验证 DMG/PKG')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--name <package>', 'DMG/PKG 名称，默认使用项目名')
  .option('--version <version>', '产物版本，默认取项目元数据（package.json/pyproject.toml），回退 0.1.0')
  .option('--artifact <type>', '产物类型：dmg 或 pkg；缺省按 Forge.md 选择')
  .option('--json', '输出结构化 JSON')
  .action((source: string, options: PackCliOptions & { plan: string; artifact?: 'dmg' | 'pkg' }) => {
    finish(packMacos({ sourceDir: source, planPath: options.plan, outputDir: options.output, packageName: options.name,
      packageVersion: options.version, artifact: options.artifact }), options);
  });

program
  .command('pack-harmonyos')
  .description('在 DevEco runner 构建并使用 hdc 安装验证 HarmonyOS HAP/APP')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--output <path>', '产物输出目录，默认 <source>/.deliverkit/artifacts')
  .option('--artifact <type>', '产物类型：hap 或 app；缺省按 Forge.md 选择')
  .option('--json', '输出结构化 JSON')
  .action((source: string, options: PackCliOptions & { plan: string; artifact?: 'hap' | 'app' }) => {
    finish(packHarmonyos({ sourceDir: source, planPath: options.plan, outputDir: options.output, artifact: options.artifact }), options);
  });

program
  .command('generate-release-manifest')
  .description('汇总各平台 JSON 结果并生成 ReleaseManifest.json')
  .argument('[source]', 'project directory', '.')
  .requiredOption('--plan <path>', '已审查的 Forge.md 路径')
  .option('--results <path>', '平台结果 JSON 目录，默认 <source>/.deliverkit/results')
  .option('--output <path>', '报告输出路径，默认 <source>/ReleaseManifest.json')
  .option('--json', '输出结构化 JSON')
  .action((source: string, options: JsonOption & { plan: string; results?: string; output?: string }) => {
    finish(generateReleaseManifest({ sourceDir: source, planPath: options.plan, resultsDir: options.results, outputPath: options.output }), options);
  });

program.parseAsync(process.argv).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
