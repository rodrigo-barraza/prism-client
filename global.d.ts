declare module "*.css" {
  const classes: { [key: string]: string };
  export default classes;
}

declare module "three";

interface Window {
  webkitAudioContext: typeof AudioContext;
}
