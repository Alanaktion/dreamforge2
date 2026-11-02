const problems = new Map<string, string>();

export function reportFileProblem(filePath: string, message?: string): void {
  if (message) problems.set(filePath, message);
  else problems.delete(filePath);
}

export function projectProblems(projectPath: string): Array<{ file: string; message: string }> {
  return [...problems.entries()]
    .filter(([file]) => file.startsWith(projectPath + '/'))
    .map(([file, message]) => ({ file: file.slice(projectPath.length + 1), message }));
}
