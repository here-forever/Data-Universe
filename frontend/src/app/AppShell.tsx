import { NavLink, useLocation } from "react-router-dom";

import { navigationItems } from "./navigation";
import { routePlaceholders } from "./routes";

export function AppShell() {
  const location = useLocation();
  const currentRoute = routePlaceholders[location.pathname] ?? routePlaceholders["/"];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-line bg-panel px-5 py-6 lg:block">
        <h1 className="text-xl font-semibold text-ink">Data Analysis System</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Integrated analytics workbench</p>
        <nav className="mt-8 space-y-1" aria-label="Main navigation">
          {navigationItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                    isActive ? "bg-brand text-white" : "text-muted hover:bg-slate-100 hover:text-ink",
                  ].join(" ")
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className="lg:pl-72">
        <header className="border-b border-line bg-panel px-6 py-4">
          <p className="text-sm font-medium text-muted">Project workspace</p>
          <p className="text-lg font-semibold text-ink">MVP foundation</p>
        </header>
        <div className="p-6">{currentRoute}</div>
      </main>
    </div>
  );
}
