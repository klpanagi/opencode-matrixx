export function isMatrixPath(filePath: string): boolean {
  return /\.matrix[/\\]/.test(filePath)
}
