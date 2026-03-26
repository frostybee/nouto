import { program } from 'commander';
import { registerRunCommand } from '../commands/run';
import { registerBenchmarkCommand } from '../commands/benchmark';
import { registerImportCommand } from '../commands/import';
import { registerExportCommand } from '../commands/export';
import { registerCodegenCommand } from '../commands/codegen';

program
  .name('nouto')
  .description('Nouto CLI - run API collections from the command line')
  .version('0.0.1');

registerRunCommand(program);
registerBenchmarkCommand(program);
registerImportCommand(program);
registerExportCommand(program);
registerCodegenCommand(program);

program.parse();
