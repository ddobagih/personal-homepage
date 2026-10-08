import type { ImgHTMLAttributes } from "react";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src: string | { src: string }; alt: string; fill?: boolean; priority?: boolean;
  unoptimized?: boolean; quality?: number; sizes?: string;
};
export function assetUrl(src: string) {
  return /^\/(?:logo|empty|error|idea|team)(?:-dark)?\.(?:svg|png|jpg)$/.test(src)
    ? `/assets/notion-app${src}` : src;
}
export default function Image({ src, alt, fill, priority, unoptimized: _unoptimized, quality: _quality, style, ...props }: ImageProps) {
  return <img {...props} src={assetUrl(typeof src === "string" ? src : src.src)} alt={alt}
    loading={priority ? "eager" : props.loading || "lazy"}
    style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style} />;
}
