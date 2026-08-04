declare module "*.css" {
  const classes: { [key: string]: string };
  export default classes;
}

declare module "three";
declare module "three/webgpu";
declare module "three/tsl";

// eslint-disable-next-line no-unused-vars -- global augmentation via declaration merging
interface Window {
  webkitAudioContext: typeof AudioContext;
}
