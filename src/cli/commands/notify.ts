import fs from 'node:fs';
import { Command } from 'commander';
import { getMessageService } from '../../core/index.js';

export const notifyCommand = new Command('notify').description(
  'Send notifications using the shared message-sender config'
);

notifyCommand
  .command('send-text')
  .description('Send a text message')
  .requiredOption('-m, --message <text>', 'Message text')
  .option('-t, --target <id>', 'Override target id (otherwise from config)')
  .action(async (options: { message: string; target?: string }) => {
    const messageService = getMessageService();
    await messageService.sendText(options.message, { target: options.target });
  });

notifyCommand
  .command('send-media')
  .description('Send a media file with optional caption')
  .requiredOption('-f, --file <path>', 'Local media file path')
  .option('-m, --message <text>', 'Caption text', '')
  .option('-t, --target <id>', 'Override target id (otherwise from config)')
  .action(async (options: { file: string; message: string; target?: string }) => {
    if (!fs.existsSync(options.file)) {
      throw new Error(`File not found: ${options.file}`);
    }

    const messageService = getMessageService();
    await messageService.sendMedia(options.message || '', options.file, {
      target: options.target,
    });
  });
