type Callback = () => void | Promise<void>;

type Task = {
  id: string;
  callback: Callback;
  timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;
  recurring: boolean;
};

const tasks = new Map<string, Task>();

export function schedule(id: string, delayMs: number, callback: Callback): void {
  cancel(id);
  const timer = setTimeout(() => {
    tasks.delete(id);
    callback();
  }, delayMs);
  tasks.set(id, { id, callback, timer, recurring: false });
}

export function scheduleRecurring(
  id: string,
  intervalMs: number,
  callback: Callback,
  options: { immediate?: boolean } = {},
): void {
  cancel(id);
  if (options.immediate) callback();
  const timer = setInterval(callback, intervalMs);
  tasks.set(id, { id, callback, timer, recurring: true });
}

export function cancel(id: string): boolean {
  const task = tasks.get(id);
  if (!task) return false;
  if (task.recurring) clearInterval(task.timer as ReturnType<typeof setInterval>);
  else clearTimeout(task.timer as ReturnType<typeof setTimeout>);
  tasks.delete(id);
  return true;
}

export function has(id: string): boolean {
  return tasks.has(id);
}

export function ids(): string[] {
  return Array.from(tasks.keys());
}

export function cancelAll(): void {
  for (const id of tasks.keys()) cancel(id);
}
