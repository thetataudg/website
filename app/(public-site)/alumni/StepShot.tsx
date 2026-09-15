import Image from "next/image";

// The screenshots are real captures of ttdg.org, so they carry the site's own
// dark card on a dark page. The pale frame keeps each one readable as a
// picture of a screen rather than bleeding into the section behind it.
export default function StepShot({
  src,
  alt,
  width,
  height,
  caption,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption: string;
}) {
  return (
    <figure className="w-full">
      <div className="overflow-hidden rounded-[22px] border border-white/15 bg-[#0d0707] shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes="(min-width: 1024px) 520px, 100vw"
          className="h-auto w-full"
        />
      </div>
      <figcaption className="mt-3 text-center text-base text-white/50">
        {caption}
      </figcaption>
    </figure>
  );
}
