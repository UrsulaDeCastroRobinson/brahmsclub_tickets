import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head>
       <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;700&family=Montserrat:wght@400;700&display=swap" rel="stylesheet" />
		<link rel="icon" type="image/png" href="/favicon.png" />
	  </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}