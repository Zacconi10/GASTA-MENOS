// FlutterFlow Custom Action: getCardBrandGradient
// Retorna o gradiente de cores baseado na bandeira do cartao

import 'package:flutter/material.dart';

List<Color> getCardBrandGradient(String? brand) {
  switch (brand?.toLowerCase()) {
    case 'visa':
      return const [Color(0xFF1A1F71), Color(0xFF2B3990)];
    case 'mastercard':
      return const [Color(0xFFEB001B), Color(0xFFF79E1B)];
    case 'elo':
      return const [Color(0xFF0036A4), Color(0xFFFFC300)];
    case 'amex':
      return const [Color(0xFF006FCF), Color(0xFF00AEEF)];
    case 'nubank':
      return const [Color(0xFF820AD1), Color(0xFF9B30FF)];
    case 'inter':
      return const [Color(0xFFFF6900), Color(0xFFFF8C00)];
    case 'c6':
      return const [Color(0xFF2A2A2A), Color(0xFF4A4A4A)];
    case 'itau':
      return const [Color(0xFF002776), Color(0xFF0047BA)];
    default:
      return const [Color(0xFF6366F1), Color(0xFF8B5CF6)]; // indigo default
  }
}
