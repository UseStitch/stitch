import { glob, type GlobOptions } from 'glob';

interface Options {
  cwd?: string;
  absolute?: boolean;
  include?: 'file' | 'all';
  dot?: boolean;
  symlink?: boolean;
}

function toGlobOptions(options: Options): GlobOptions {
  return {
    cwd: options.cwd,
    absolute: options.absolute,
    dot: options.dot,
    follow: options.symlink ?? false,
    nodir: options.include !== 'all',
  };
}

export async function scan(pattern: string, options: Options = {}): Promise<string[]> {
  return glob(pattern, toGlobOptions(options)) as Promise<string[]>;
}
