import * as fs from 'node:fs/promises';
import { CliError } from './errors.ts';

export async function readJsonPayload(
  filePath: string,
  stdin?: NodeJS.ReadableStream | AsyncIterable<string | Buffer>,
): Promise<Record<string, unknown>> {
  let content = '';

  if (filePath === '-') {
    if (!stdin) {
      throw new CliError(2, 'INVALID_ARGUMENT', 'No stdin stream available to read payload');
    }
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of stdin) {
        if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk, 'utf8'));
        } else {
          chunks.push(chunk);
        }
      }
      content = Buffer.concat(chunks).toString('utf8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new CliError(2, 'INVALID_ARGUMENT', `Failed to read payload from stdin: ${msg}`);
    }
  } else {
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new CliError(2, 'INVALID_ARGUMENT', `Failed to read payload file "${filePath}": ${msg}`);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliError(2, 'INVALID_ARGUMENT', `Malformed JSON in payload: ${msg}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CliError(2, 'INVALID_ARGUMENT', 'Payload body must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}
