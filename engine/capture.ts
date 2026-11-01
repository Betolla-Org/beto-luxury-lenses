const SHARE_FILENAME = 'BETO_Look.jpg';

/** Burns the BETO branding and lens name into the bottom of a captured frame. */
export const addWatermark = (imgUrl: string, lensName: string): Promise<string> =>
  new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(imgUrl);

      ctx.drawImage(img, 0, 0);

      // Laid out for a 400px-wide photo and scaled to the real width, so it looks the same at any resolution
      const k = canvas.width / 400;
      const px = (n: number) => n * k;
      const band = px(300);

      const gradient = ctx.createLinearGradient(0, canvas.height - band, 0, canvas.height);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, canvas.height - band, canvas.width, band);

      const centerX = canvas.width / 2;
      ctx.shadowColor = 'rgba(212, 175, 55, 0.5)';
      ctx.shadowBlur = px(15);
      ctx.font = `900 ${px(60)}px 'Playfair Display'`;
      ctx.fillStyle = '#D4AF37';
      ctx.textAlign = 'center';
      ctx.fillText('BETO', centerX, canvas.height - px(140));

      ctx.shadowBlur = 0;
      ctx.font = `500 ${px(24)}px 'Manrope'`;
      ctx.fillStyle = '#FFFFFF';
      ctx.letterSpacing = `${px(3)}px`;
      ctx.fillText(lensName.toUpperCase(), centerX, canvas.height - px(90));

      ctx.font = `300 ${px(18)}px 'Manrope'`;
      ctx.fillStyle = '#D4AF37';
      ctx.letterSpacing = '0px';
      // A detached canvas lays text out left-to-right, which put the Arabic line's final "٪" at its start
      ctx.direction = 'rtl';
      ctx.fillText('نتيجة لون العدسة على العين مطابقة بنسبة ٨٥٪ إلى ٩٠٪', centerX, canvas.height - px(55));

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(imgUrl);
    img.src = imgUrl;
  });

export const dataUrlToBlob = (dataUrl: string): Blob | null => {
  try {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1];
    if (!mime || data === undefined) return null;
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    return new Blob([bytes], { type: mime });
  } catch (e) {
    console.error('Error converting data URL to Blob:', e);
    return null;
  }
};

const download = (dataUrl: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = SHARE_FILENAME;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/** Opens the native share sheet when files can be shared, otherwise downloads the image. */
export const shareImage = async (dataUrl: string) => {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return download(dataUrl);

  const file = new File([blob], SHARE_FILENAME, { type: 'image/jpeg' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'My BETO Lens Look',
        text: 'Check out my new look with BETO lenses! #BETOLenses',
      });
      return;
    }
  } catch (e) {
    // The user closing the share sheet is not a reason to force a download.
    if ((e as DOMException)?.name === 'AbortError') return;
    console.log('Sharing failed:', e);
  }
  download(dataUrl);
};
