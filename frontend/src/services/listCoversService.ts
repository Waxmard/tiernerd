import {
  ImageManipulator,
  type ImageRef,
  SaveFormat,
} from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import type { ListCover } from '../design-system/tokens/colors';
import { api } from './api';

export type ListPhoto =
  | { source: 'upload'; id: string }
  | {
      source: 'unsplash';
      id: string;
      url: string;
      photographer_name: string;
      photographer_url: string;
      photo_url: string;
    };

export interface CoverSearchResult {
  id: string;
  url: string;
  thumbnail_url: string;
  photographer_name: string;
  photographer_url: string;
  photo_url: string;
}

export type CoverDraft =
  | { kind: 'none' }
  | { kind: 'landscape' }
  | { kind: 'persisted'; photo: ListPhoto }
  | { kind: 'unsplash'; photo: CoverSearchResult }
  | { kind: 'local'; uri: string; blob?: Blob };

export function coverDraftFromSaved(
  cover: ListCover | null,
  photo: ListPhoto | null
): CoverDraft {
  if (photo) return { kind: 'persisted', photo };
  return cover === 'landscape' ? { kind: 'landscape' } : { kind: 'none' };
}

const MAX_IMAGE_EDGE = 1600;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function imageDimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('Image dimensions are unavailable');
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function pickWebFile(): Promise<File | null> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  return new Promise<File | null>((resolve) => {
    const finish = () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', finish, { once: true });
    input.addEventListener('cancel', finish, { once: true });
    document.body.appendChild(input);
    try {
      input.click();
    } catch (error) {
      input.remove();
      throw error;
    }
  });
}

async function convertWebImage(uri: string): Promise<Blob> {
  const image = new Image();
  image.src = uri;
  await image.decode();
  const { width, height } = imageDimensions(
    image.naturalWidth,
    image.naturalHeight
  );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image could not be processed');
  context.drawImage(image, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type === 'image/jpeg') resolve(blob);
        else reject(new Error('Image could not be converted to JPEG'));
      },
      'image/jpeg',
      0.85
    );
  });
}

async function convertNativeImage(
  uri: string
): Promise<{ uri: string; size: number }> {
  const context = ImageManipulator.manipulate(uri);
  let image: ImageRef | undefined;
  let convertedUri: string;
  try {
    image = await context.renderAsync();
    const { width, height } = imageDimensions(image.width, image.height);
    if (width !== image.width || height !== image.height) {
      const resized = await context.resize({ width, height }).renderAsync();
      image.release();
      image = resized;
    }
    const converted = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.85,
    });
    convertedUri = converted.uri;
  } finally {
    image?.release();
    context.release();
  }
  const response = await fetch(convertedUri);
  if (!response.ok) throw new Error('Image could not be read');
  const blob = await response.blob();
  const size = blob.size;
  if ('close' in blob && typeof blob.close === 'function') blob.close();
  return { uri: convertedUri, size };
}

export async function pickLocalCover(): Promise<Extract<
  CoverDraft,
  { kind: 'local' }
> | null> {
  let assetUri: string;
  try {
    if (Platform.OS === 'web') {
      const file = await pickWebFile();
      if (!file) return null;
      assetUri = URL.createObjectURL(file);
    } else {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (selection.canceled) return null;
      const asset = selection.assets[0];
      if (!asset) throw new Error('No photo was selected');
      assetUri = asset.uri;
    }
  } catch {
    throw new Error('Could not open the photo picker. Please try again.');
  }

  let converted: { blob: Blob } | { uri: string; size: number };
  try {
    converted =
      Platform.OS === 'web'
        ? { blob: await convertWebImage(assetUri) }
        : await convertNativeImage(assetUri);
  } catch {
    throw new Error(
      'Could not process this photo. Choose another image and try again.'
    );
  } finally {
    if (Platform.OS === 'web') URL.revokeObjectURL(assetUri);
  }

  const size = 'blob' in converted ? converted.blob.size : converted.size;
  if (!size) {
    throw new Error('The selected photo is empty. Choose another image.');
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new Error(
      'The photo is larger than 10 MiB after processing. Choose a smaller image.'
    );
  }
  return 'blob' in converted
    ? {
        kind: 'local',
        uri: URL.createObjectURL(converted.blob),
        blob: converted.blob,
      }
    : { kind: 'local', uri: converted.uri };
}

export function searchCoverPhotos(
  query: string,
  page: number,
  token: string
): Promise<{ results: CoverSearchResult[]; has_more: boolean }> {
  return api.get<{ results: CoverSearchResult[]; has_more: boolean }>(
    `/api/lists/cover-search?query=${encodeURIComponent(query)}&page=${page}`,
    token
  );
}

export async function getCoverSearchAvailability(
  token: string
): Promise<boolean> {
  const { enabled } = await api.get<{ enabled: boolean }>(
    '/api/lists/cover-search/availability',
    token
  );
  return enabled;
}
