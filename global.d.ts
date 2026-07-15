declare module "*.css" {
  const classes: { [key: string]: string };
  export default classes;
}

declare module "three";

// eslint-disable-next-line no-unused-vars -- global augmentation via declaration merging
interface Window {
  webkitAudioContext: typeof AudioContext;
}
