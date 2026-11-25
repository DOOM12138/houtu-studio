// MB follows the existing binary file-size display (1 MB = 1024 × 1024 bytes).
export const IMAGE_UPLOAD_MB=100;
export const MAX_IMAGE_UPLOAD_BYTES=IMAGE_UPLOAD_MB*1024*1024;
export const MAX_IMAGE_BASE64_CHARS=Math.ceil(MAX_IMAGE_UPLOAD_BYTES/3)*4;
// Base64 is about 4/3 the file size. Reserve room for small masks and references.
export const IMAGE_JSON_BODY_BYTES=192*1024*1024;
export const LAB_JSON_BODY_BYTES=384*1024*1024;
export const IMAGE_UPLOAD_MESSAGE='单张图片最大支持100 MB。';
