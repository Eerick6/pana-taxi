import { Injectable } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads';

@Injectable()
export class LocalStorageService {
  save(folder: string, buffer: Buffer, originalName: string): string {
    const ext = originalName.split('.').pop() ?? 'jpg';
    const filename = `${uuid()}.${ext}`;
    const dir = join(UPLOADS_DIR, folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), buffer);
    // Prefijo "local:" para distinguir de keys antiguas de R2
    return `local:${folder}/${filename}`;
  }

  // Convierte "local:clients/x/uuid.jpg" → "clients/x/uuid.jpg" (path relativo al /static)
  staticPath(key: string): string {
    return key.replace(/^local:/, '');
  }

  isLocal(key: string): boolean {
    return key.startsWith('local:');
  }
}
