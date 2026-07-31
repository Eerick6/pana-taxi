import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

class AppTextStyles {
  AppTextStyles._();

  static TextStyle get _base => GoogleFonts.inter(
        color: AppColors.gray900,
        letterSpacing: -0.2,
      );

  // ── Display / Headlines ───────────────────────────────────────────────────────
  static TextStyle get h1 => _base.copyWith(fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: -0.5);
  static TextStyle get h2 => _base.copyWith(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.4);
  static TextStyle get h3 => _base.copyWith(fontSize: 18, fontWeight: FontWeight.w600, letterSpacing: -0.3);
  static TextStyle get h4 => _base.copyWith(fontSize: 16, fontWeight: FontWeight.w600);

  // ── Body ─────────────────────────────────────────────────────────────────────
  static TextStyle get bodyLg => _base.copyWith(fontSize: 16, fontWeight: FontWeight.w400, height: 1.6);
  static TextStyle get body   => _base.copyWith(fontSize: 14, fontWeight: FontWeight.w400, height: 1.5);
  static TextStyle get bodySm => _base.copyWith(fontSize: 13, fontWeight: FontWeight.w400, height: 1.4);

  // ── Labels ───────────────────────────────────────────────────────────────────
  static TextStyle get labelLg => _base.copyWith(fontSize: 15, fontWeight: FontWeight.w500);
  static TextStyle get label   => _base.copyWith(fontSize: 13, fontWeight: FontWeight.w500);
  static TextStyle get labelSm => _base.copyWith(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 0.2);

  // ── Caption ──────────────────────────────────────────────────────────────────
  static TextStyle get caption => _base.copyWith(fontSize: 11, fontWeight: FontWeight.w400, color: AppColors.gray500);

  // ── Button ───────────────────────────────────────────────────────────────────
  static TextStyle get btnLg => _base.copyWith(fontSize: 16, fontWeight: FontWeight.w600, letterSpacing: 0.1);
  static TextStyle get btn   => _base.copyWith(fontSize: 14, fontWeight: FontWeight.w600, letterSpacing: 0.1);
}
