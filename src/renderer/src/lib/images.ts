import { LIMITS } from '../../../shared/defaults';
import type { Attachment } from '../../../shared/types';
import { uid } from './api';

const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
const MAX_EDGE = 2000;

/** Reads an image file the user picked, pasted or dropped, downscaling very large ones. */
export async function fileToAttachment(file: File): Promise<Attachment> {
  if (!(TYPES as readonly string[]).includes(file.type)) throw new Error('Only PNG, JPEG, WebP and GIF images are supported.');
  if (file.size > 20 * 1024 * 1024) throw new Error('That image is larger than 20 MB.');

  const bitmap = await createImageBitmap(file);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  let mediaType = file.type as Attachment['mediaType'];
  let data: string;

  if (longEdge > MAX_EDGE || file.type === 'image/gif' || file.size > 4 * 1024 * 1024) {
    const ratio = Math.min(1, MAX_EDGE / longEdge);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    mediaType = file.type === 'image/png' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg';
    data = canvas.toDataURL(mediaType, 0.88).split(',')[1] ?? '';
  } else {
    data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsDataURL(file);
    });
  }
  bitmap.close();
  if (!data || data.length > LIMITS.attachmentBase64Chars) throw new Error('That image is too large to attach.');
  return { id: uid(), kind: 'image', mediaType, data, name: file.name.slice(0, 120) || 'Image' };
}

export function attachmentUrl(a: Attachment): string {
  return `data:${a.mediaType};base64,${a.data}`;
}
