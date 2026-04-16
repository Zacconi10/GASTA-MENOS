// FlutterFlow Custom Action: getDaysUntilDue
// Calcula quantos dias faltam para o vencimento da fatura
// Retorna negativo se ja venceu

int getDaysUntilDue(DateTime dueDate) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final due = DateTime(dueDate.year, dueDate.month, dueDate.day);
  return due.difference(today).inDays;
}
