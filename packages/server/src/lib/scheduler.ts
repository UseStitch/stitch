type Callback = () => void | Promise<void>;

type Task = {
  id: string;
  callback: Callback;
  timer: ReturnType<typeof setInterval>;
  recurring: boolean;
};

const tasks = new Map<string, Task>();

export function scheduleRecurring(
  id: string,
  intervalMs: number,
  callback: Callback,
  options: { immediate?: boolean } = {},
): void {
  cancel(id);
  if (options.immediate) void callback();
  const timer = setInterval(callback, intervalMs);
  tasks.set(id, { id, callback, timer, recurring: true });
}

function cancel(id: string): boolean {
  const task = tasks.get(id);
  if (!task) return false;
  if (task.recurring) clearInterval(task.timer);
  else clearTimeout(task.timer);
  tasks.delete(id);
  return true;
}

export function cancelAll(): void {
  for (const id of tasks.keys()) cancel(id);
}
