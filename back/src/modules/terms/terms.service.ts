import { Injectable, NotFoundException, BadRequestException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TermsVersion, TermsType } from './entities/terms-version.entity';
import { CreateTermsVersionDto } from './dto/create-terms-version.dto';

const PLACEHOLDER: Record<TermsType, { version: string; content: string }> = {
  [TermsType.CLIENT]: {
    version: '1.0',
    content: `TÉRMINOS Y CONDICIONES DE USO — CLIENTES
Versión 1.0 — BORRADOR PRELIMINAR (pendiente de revisión legal)
Última actualización: junio 2026

1. NATURALEZA DE LA PLATAFORMA
[NOMBRE DE LA PLATAFORMA] es un intermediario tecnológico que conecta a usuarios con conductores y cooperativas de transporte legalmente constituidas. La plataforma NO presta servicios de transporte directamente. El contrato de transporte se celebra únicamente entre el cliente y el conductor.

2. ACEPTACIÓN DE TÉRMINOS
Al registrarte y usar la aplicación, aceptas estos términos en su totalidad. Si no estás de acuerdo, debes abstenerte de usar el servicio.

3. REGISTRO
Debes proporcionar información veraz y actualizada. Eres responsable de mantener la confidencialidad de tu cuenta. Está prohibido crear cuentas con datos falsos.

4. USO DEL SERVICIO
El servicio es para uso personal y no comercial. Queda prohibido usar la plataforma para actividades ilegales, acosar a conductores o manipular el sistema de calificaciones.

5. PAGOS
El precio del viaje se calcula según la tarifa vigente al momento de la solicitud. Los pagos procesados son finales salvo disputa justificada reportada dentro de las 24 horas siguientes al viaje.

6. CALIFICACIONES
Las calificaciones deben ser honestas y basadas en la experiencia real del viaje. Calificaciones falsas o malintencionadas pueden resultar en suspensión de la cuenta.

7. PROTECCIÓN DE DATOS (LOPDP)
Recopilamos tu nombre, teléfono y datos de uso conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador. Tus datos se usan exclusivamente para operar el servicio. Tienes derechos de acceso, rectificación, cancelación y oposición (ARCO). Para ejercerlos escríbenos a [EMAIL DE CONTACTO].

8. LIMITACIÓN DE RESPONSABILIDAD
La plataforma no es responsable por daños ocurridos durante el viaje, objetos olvidados, retrasos o diferencias entre el conductor y el cliente. En caso de incidente, debes reportarlo dentro de las 48 horas.

9. SUSPENSIÓN Y CANCELACIÓN
Podemos suspender o cancelar tu cuenta por violación de estos términos, fraude, abuso del sistema o comportamiento inapropiado reportado por conductores.

10. LEY APLICABLE
Estos términos se rigen por las leyes de la República del Ecuador. Cualquier disputa se someterá a los tribunales competentes del Ecuador.

[DOCUMENTO BORRADOR — SUJETO A REVISIÓN POR ABOGADO]`,
  },

  [TermsType.DRIVER]: {
    version: '1.0',
    content: `TÉRMINOS Y CONDICIONES PARA CONDUCTORES
Versión 1.0 — BORRADOR PRELIMINAR (pendiente de revisión legal)
Última actualización: junio 2026

1. NATURALEZA DE LA RELACIÓN
[NOMBRE DE LA PLATAFORMA] es un intermediario tecnológico. No existe relación laboral entre la plataforma y el conductor. El conductor opera de forma independiente o bajo el amparo de su cooperativa. La plataforma facilita la conexión con clientes.

2. REQUISITOS PARA REGISTRARSE
Para operar como conductor debes: (a) poseer licencia de conducir profesional tipo E vigente; (b) no tener antecedentes penales relevantes; (c) ser mayor de 18 años; (d) mantener todos tus documentos vigentes durante tu actividad en la plataforma.

3. DOCUMENTOS Y VERIFICACIÓN
Los documentos que subes son revisados visualmente por nuestro equipo. La plataforma NO actúa como entidad verificadora oficial ante el SRI, ANT, SEPS ni ningún organismo gubernamental. La veracidad y vigencia de tus documentos es tu responsabilidad exclusiva. Documentos falsificados resultarán en eliminación permanente y denuncia a las autoridades.

4. CONDUCTA Y CALIDAD DE SERVICIO
Debes tratar a los clientes con respeto y profesionalismo. Queda prohibido rechazar servicios por discriminación, cobrar tarifas no autorizadas o desviarte de la ruta acordada sin justificación.

5. COMISIONES
La plataforma cobra una comisión sobre cada viaje completado según la tarifa vigente publicada en la sección de configuración. Esta tarifa puede ajustarse con previo aviso de 15 días.

6. PAGOS Y WALLET
Los ingresos se acreditan a tu billetera digital en la plataforma. Los retiros están sujetos a los tiempos y condiciones del módulo de billetera.

7. CALIFICACIONES
Las calificaciones recibidas de clientes son públicas. Una calificación promedio sostenida por debajo de 3.5 estrellas puede resultar en revisión de cuenta o suspensión temporal.

8. PROTECCIÓN DE DATOS (LOPDP)
Recopilamos tu cédula, licencia, foto y datos de ubicación conforme a la Ley Orgánica de Protección de Datos Personales. Los datos de ubicación se procesan únicamente durante viajes activos. Tienes derechos ARCO. Para ejercerlos escríbenos a [EMAIL DE CONTACTO].

9. SUSPENSIÓN Y CANCELACIÓN
Tu cuenta puede ser suspendida por: documentos vencidos o rechazados, calificación baja sostenida, quejas reiteradas de clientes, fraude o violación de estos términos.

10. LEY APLICABLE
Estos términos se rigen por las leyes de la República del Ecuador.

[DOCUMENTO BORRADOR — SUJETO A REVISIÓN POR ABOGADO]`,
  },

  [TermsType.COOPERATIVE]: {
    version: '1.0',
    content: `TÉRMINOS Y CONDICIONES PARA COOPERATIVAS
Versión 1.0 — BORRADOR PRELIMINAR (pendiente de revisión legal)
Última actualización: junio 2026

1. NATURALEZA DE LA RELACIÓN
[NOMBRE DE LA PLATAFORMA] es un intermediario tecnológico que facilita la conexión entre cooperativas de transporte legalmente constituidas, sus conductores y los usuarios del servicio. La plataforma NO es parte del contrato de transporte ni de la relación laboral/contractual entre la cooperativa y sus conductores.

2. REQUISITOS PARA OPERAR
La cooperativa debe estar legalmente constituida ante la SEPS, contar con RUC activo ante el SRI y poseer permiso de operación vigente emitido por la ANT o el GADM correspondiente. La plataforma solicita estos documentos para revisión interna únicamente.

3. DOCUMENTOS Y VERIFICACIÓN
Los documentos aportados son revisados visualmente por nuestro equipo. [NOMBRE DE LA PLATAFORMA] NO actúa como entidad verificadora oficial. La plataforma no garantiza ni certifica la validez legal de los permisos ante ningún organismo gubernamental. La responsabilidad de mantener permisos, cupos y habilitaciones vigentes recae exclusiva e íntegramente en la cooperativa.

4. PERMISOS Y CUPOS DE VEHÍCULOS
La asignación de cupos de operación a cada vehículo es responsabilidad de la cooperativa y sus relaciones con la ANT/GADM. La plataforma no interviene en dicho proceso ni puede ser responsabilizada por operación de vehículos sin cupo habilitado.

5. CONDUCTORES REGISTRADOS BAJO LA COOPERATIVA
La cooperativa asume la responsabilidad de supervisar que los conductores registrados bajo su nombre cumplan con los requisitos legales vigentes. La aprobación en la plataforma no reemplaza las obligaciones legales de la cooperativa frente a sus conductores.

6. COMISIONES
La plataforma puede aplicar una comisión negociada por viaje o por período. Las condiciones específicas se establecen al momento de la aprobación y pueden variar con previo aviso de 30 días.

7. PROTECCIÓN DE DATOS (LOPDP)
Los documentos e información de la cooperativa y su representante legal se almacenan conforme a la Ley Orgánica de Protección de Datos Personales. Se usan exclusivamente para la verificación y operación del servicio. Para ejercer derechos ARCO escríbenos a [EMAIL DE CONTACTO].

8. SUSPENSIÓN
La cooperativa puede ser suspendida de la plataforma por: documentos vencidos, permiso de operación ANT revocado, quejas reiteradas no resueltas, fraude o incumplimiento de estos términos. La suspensión no exime de obligaciones económicas pendientes.

9. LIMITACIÓN DE RESPONSABILIDAD
La plataforma no es responsable por incidentes ocurridos durante la prestación del servicio de transporte, por la validez o vigencia de permisos gubernamentales de la cooperativa, ni por conflictos entre la cooperativa y sus conductores.

10. LEY APLICABLE
Estos términos se rigen por las leyes de la República del Ecuador. Cualquier controversia se someterá a los tribunales competentes del Ecuador.

[DOCUMENTO BORRADOR — SUJETO A REVISIÓN POR ABOGADO]`,
  },
};

@Injectable()
export class TermsService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(TermsVersion)
    private termsRepo: Repository<TermsVersion>,
  ) {}

  // Seeds initial T&C if no active version exists for each type
  async onApplicationBootstrap() {
    for (const type of Object.values(TermsType)) {
      const existing = await this.termsRepo.findOne({ where: { type, is_active: true } });
      if (!existing) {
        const placeholder = PLACEHOLDER[type];
        await this.termsRepo.save(
          this.termsRepo.create({ ...placeholder, type, is_active: true }),
        );
      }
    }
  }

  async getCurrent(type: TermsType) {
    const terms = await this.termsRepo.findOne({ where: { type, is_active: true } });
    if (!terms) throw new NotFoundException('Términos no encontrados');
    return terms;
  }

  async getAll() {
    return this.termsRepo.find({ order: { created_at: 'DESC' } });
  }

  // Platform publishes a new version — deactivates previous, activates new
  async publish(dto: CreateTermsVersionDto) {
    const existing = await this.termsRepo.findOne({ where: { type: dto.type, version: dto.version } });
    if (existing) throw new BadRequestException(`La versión ${dto.version} ya existe para este tipo`);

    await this.termsRepo.update({ type: dto.type, is_active: true }, { is_active: false });

    const newVersion = await this.termsRepo.save(
      this.termsRepo.create({ ...dto, is_active: true }),
    );

    return {
      message: `Versión ${dto.version} publicada y activada. Los usuarios verán los nuevos términos en su próximo acceso.`,
      terms_id: newVersion.id,
    };
  }

  // Validates that the version the user claims to have accepted is the current active one
  async validateAcceptance(type: TermsType, version: string): Promise<TermsVersion> {
    const current = await this.getCurrent(type);
    if (current.version !== version) {
      throw new BadRequestException(
        `Debes aceptar la versión vigente de los términos (${current.version}). Obtén los términos actuales en GET /terms/${type}`,
      );
    }
    return current;
  }
}
