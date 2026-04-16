// FlutterFlow Custom Action: getInvoiceStatusColor
// Retorna a cor do badge de acordo com o status da fatura

import 'package:flutter/material.dart';

Color getInvoiceStatusColor(String status) {
  switch (status) {
    case 'aberta':
      return const Color(0xFF3B82F6); // blue
    case 'fechada':
      return const Color(0xFF6B7280); // gray
    case 'paga':
      return const Color(0xFF10B981); // emerald green
    case 'parcial':
      return const Color(0xFFF59E0B); // amber
    default:
      return const Color(0xFF6B7280); // gray fallback
  }
}

String getInvoiceStatusLabel(String status) {
  switch (status) {
    case 'aberta':
      return 'Aberta';
    case 'fechada':
      return 'Fechada';
    case 'paga':
      return 'Paga';
    case 'parcial':
      return 'Parcial';
    default:
      return status;
  }
}
