import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  // ── Brand ────────────────────────────────────────────────────────────────────
  static const primary      = Color(0xFFFFD600);   // amarillo Pana
  static const primaryDark  = Color(0xFFF0C800);
  static const primaryLight = Color(0xFFFFF9CC);

  static const secondary    = Color(0xFF1A1A1A);   // negro
  static const white        = Color(0xFFFFFFFF);

  static const accent       = Color(0xFF00C07F);   // verde estado activo
  static const accentLight  = Color(0xFFE0FFF5);

  static const warning      = Color(0xFFF59E0B);
  static const warningLight = Color(0xFFFFFBEB);

  static const error        = Color(0xFFEF4444);
  static const errorLight   = Color(0xFFFEF2F2);

  static const success      = Color(0xFF10B981);
  static const successLight = Color(0xFFECFDF5);

  // ── Neutrals ─────────────────────────────────────────────────────────────────
  static const gray900 = Color(0xFF111827);
  static const gray800 = Color(0xFF1F2937);
  static const gray700 = Color(0xFF374151);
  static const gray600 = Color(0xFF4B5563);
  static const gray500 = Color(0xFF6B7280);
  static const gray400 = Color(0xFF9CA3AF);
  static const gray300 = Color(0xFFD1D5DB);
  static const gray200 = Color(0xFFE5E7EB);
  static const gray100 = Color(0xFFF3F4F6);
  static const gray50  = Color(0xFFF9FAFB);

  // ── Variantes oscuras para texto sobre fondo blanco/claro ────────────────────
  static const primaryText = Color(0xFF78560A);  // ámbar oscuro ~5.5:1 contraste
  static const errorText   = Color(0xFFB91C1C);  // rojo oscuro  ~5.9:1 contraste
  static const warningText = Color(0xFF92400E);  // naranja oscuro ~5.7:1 contraste

  // ── Status de conductor ───────────────────────────────────────────────────────
  static const online  = Color(0xFF10B981);
  static const busy    = Color(0xFFF59E0B);
  static const offline = Color(0xFF9CA3AF);

  // ── Mapa ─────────────────────────────────────────────────────────────────────
  static const mapBackground      = Color(0xFFF5F5F0);
  static const routeLine          = Color(0xFF1A1A1A);
  static const driverMarker       = Color(0xFFFFD600);
  static const clientMarker       = Color(0xFF00C07F);
  static const destinationMarker  = Color(0xFFEF4444);
}
