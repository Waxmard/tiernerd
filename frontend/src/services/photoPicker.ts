import {
  ImageManipulator,
  type ImageRef,
  SaveFormat,
} from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

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

async function convertNativeImage(uri: string): Promise<Blob> {
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
  return response.blob();
}

export async function pickLocalPhoto(): Promise<Blob | null> {
  let assetUri: string;
  try {
    const selection = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (selection.canceled) return null;
    const asset = selection.assets[0];
    if (!asset) throw new Error('No photo was selected');
    assetUri = asset.uri;
  } catch (error) {
    throw new Error('Could not open the photo picker. Please try again.', {
      cause: error,
    });
  }

  let blob: Blob;
  try {
    blob = await convertNativeImage(assetUri);
  } catch (error) {
    throw new Error(
      'Could not process this photo. Choose another image and try again.',
      { cause: error }
    );
  }

  if (!blob.size) {
    throw new Error('The selected photo is empty. Choose another image.');
  }
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(
      'The photo is larger than 10 MiB after processing. Choose a smaller image.'
    );
  }
  return blob;
}
