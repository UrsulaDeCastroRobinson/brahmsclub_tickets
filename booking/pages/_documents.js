import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        {/* Add Brahms Club Google Fonts here */}
        <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;700&family=Montserrat:wght@400;700&display=swap" rel="stylesheet" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}