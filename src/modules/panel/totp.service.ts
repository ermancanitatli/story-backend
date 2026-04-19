import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class TotpService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  async generateQR(username: string, secret: string): Promise<string> {
    const uri = authenticator.keyuri(username, 'Story Admin', secret);
    return qrcode.toDataURL(uri);
  }

  verify(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch {
      return false;
    }
  }

  generateRecoveryCodes(count = 8): string[] {
    return Array.from(
      { length: count },
      () =>
        Math.random().toString(36).slice(2, 6) +
        '-' +
        Math.random().toString(36).slice(2, 6),
    );
  }

  async hashRecoveryCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
  }

  async consumeRecoveryCode(
    code: string,
    hashedCodes: string[],
  ): Promise<{ matched: boolean; remaining: string[] }> {
    for (let i = 0; i < hashedCodes.length; i++) {
      if (await bcrypt.compare(code, hashedCodes[i])) {
        const remaining = [
          ...hashedCodes.slice(0, i),
          ...hashedCodes.slice(i + 1),
        ];
        return { matched: true, remaining };
      }
    }
    return { matched: false, remaining: hashedCodes };
  }
}
