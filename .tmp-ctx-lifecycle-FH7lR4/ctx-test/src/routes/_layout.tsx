import { ThemeContext, UserContext } from '../context'
export default function RootLayout({ children }: { children: any }) {
  return (
    <ThemeContext.Provider value="dark">
      {() => (
        <UserContext.Provider value={{ name: 'Alice' }}>
          {() => (
            <>
              <div id="theme-indicator">Theme: {ThemeContext.use()}</div>
              <div id="user-name">User: {UserContext.use().name}</div>
              <button id="toggle-theme" type="button" onClick$={() => { const cur = ThemeContext.use(); const next = cur === 'dark' ? 'light' : 'dark'; (ThemeContext as unknown as { value: string }).value = next; const el = document.getElementById('theme-indicator'); if (el) el.textContent = 'Theme: ' + next; }}>
                Toggle theme
              </button>
              <main>{children}</main>
            </>
          )}
        </UserContext.Provider>
      )}
    </ThemeContext.Provider>
  )
}
