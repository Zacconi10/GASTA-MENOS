// FlutterFlow Custom Action: calculateInstallmentValue
// Calcula o valor de cada parcela dado o valor total e numero de parcelas
// Usar na tela de Adicionar Compra: atualizar campo "Valor da Parcela"
// quando o usuario muda o numero de parcelas.

import 'dart:math';

double calculateInstallmentValue(double totalAmount, int installmentCount) {
  if (installmentCount <= 0) return 0.0;
  return totalAmount / installmentCount;
}
