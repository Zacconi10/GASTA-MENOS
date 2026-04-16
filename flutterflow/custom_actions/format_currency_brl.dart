// FlutterFlow Custom Action: formatCurrencyBRL
// Formata um valor numerico para o formato brasileiro de moeda (R$)
// Exemplo: 1234.56 -> "R$ 1.234,56"

import 'package:intl/intl.dart';

String formatCurrencyBRL(double value) {
  final format = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$ ');
  return format.format(value);
}
