#!/usr/bin/env node

/**
 * DeliverKit CLI
 *
 * 当前提供两个规划命令（与 MCP 工具对应）：
 * - deliverkit inspect [source]      识别项目与交付目标建议
 * - deliverkit plan [source] --goals 生成 Forge.md 交付契约
 *
 * 构建命令（pack_*）将在后续阶段接入。
 */

import { Command } from 'commander';
import { inspectProject } from '../capabilities/inspect-project.js';
import { generatePackagingPlan } from '../capabilities/generate-packaging-plan.js';

const program = new Command();

interface PlanCliOptions {
  goals?: string;
  env?: string;
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

program.parseAsync(process.argv).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
