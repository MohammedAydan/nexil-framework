export const seo = {
  title: 'Support request',
  description: 'Send a native-first support request.',
}

export default function Support() {
  return (
    <section>
      <h1>Support request</h1>
      <form action="/api/support" method="post">
        <label htmlFor="message">Describe the issue</label>
        <textarea id="message" name="message" minLength={20} required />
        <button type="submit">Send support request</button>
      </form>
    </section>
  )
}
