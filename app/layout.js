export const metadata = {
  title: 'LifePath AI - Career & Finance Bodyguard',
  description: 'India\'s AI career bodyguard. Get jobs, side hustles, money advice in Malayalam.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-KNHVQW9W63"></script>
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-KNHVQW9W63');
        `}} />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#060b14' }}>
        {children}
      </body>
    </html>
  );
}
