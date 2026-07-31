import 'package:flutter/material.dart';

class EcuadorianBankInfo {
  const EcuadorianBankInfo({
    required this.name,
    required this.color,
    required this.abbr,
    required this.logoUrl,
  });
  final String name;
  final Color color;
  final String abbr;
  final String logoUrl;
}

const kEcuadorianBanks = [
  EcuadorianBankInfo(
    name: 'Banco Pichincha',
    color: Color(0xFFE30613),
    abbr: 'BP',
    logoUrl: 'https://www.google.com/s2/favicons?domain=pichincha.com&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Banco del Pacífico',
    color: Color(0xFF00467F),
    abbr: 'PAC',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bancopacifico.com&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Produbanco',
    color: Color(0xFF00A3E0),
    abbr: 'PRO',
    logoUrl: 'https://www.google.com/s2/favicons?domain=produbanco.com.ec&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Banco Guayaquil',
    color: Color(0xFF007B40),
    abbr: 'BG',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bancoguayaquil.com&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Banco Internacional',
    color: Color(0xFFE8000D),
    abbr: 'BI',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bancointernacional.com.ec&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Banco Bolivariano',
    color: Color(0xFF003087),
    abbr: 'BOL',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bolivariano.com&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Banco de Loja',
    color: Color(0xFFC8A900),
    abbr: 'BL',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bancodeloja.fin.ec&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Banco de Machala',
    color: Color(0xFF1A6B3C),
    abbr: 'BM',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bancomachala.com&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'BanEcuador',
    color: Color(0xFF006633),
    abbr: 'BAN',
    logoUrl: 'https://www.google.com/s2/favicons?domain=banecuador.fin.ec&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Mutualista Pichincha',
    color: Color(0xFF8B0000),
    abbr: 'MP',
    logoUrl: 'https://www.google.com/s2/favicons?domain=mutualistapichincha.com&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Cooperativa JEP',
    color: Color(0xFF1B3D7B),
    abbr: 'JEP',
    logoUrl: 'https://www.google.com/s2/favicons?domain=coopjep.fin.ec&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Cooperativa Jardín Azuayo',
    color: Color(0xFF006D77),
    abbr: 'JA',
    logoUrl: 'https://www.google.com/s2/favicons?domain=jardinazuayo.fin.ec&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Diners Club',
    color: Color(0xFF004A9A),
    abbr: 'DC',
    logoUrl: 'https://www.google.com/s2/favicons?domain=dinersclub.com.ec&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Banco del Austro',
    color: Color(0xFF7B1FA2),
    abbr: 'AUS',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bancodelaustro.com&sz=128',
  ),
  EcuadorianBankInfo(
    name: 'Otro',
    color: Color(0xFF6B7280),
    abbr: '...',
    logoUrl: '',
  ),
];

EcuadorianBankInfo getBankInfo(String bankName) {
  return kEcuadorianBanks.firstWhere(
    (b) => b.name == bankName,
    orElse: () => EcuadorianBankInfo(
      name: bankName,
      color: const Color(0xFF6B7280),
      abbr: bankName.length >= 3
          ? bankName.substring(0, 3).toUpperCase()
          : bankName.toUpperCase(),
      logoUrl: '',
    ),
  );
}
