"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  FolderPlus,
  History,
  Home,
  Info,
  KeyRound,
  LogOut,
  Menu,
  Plus,
  Scale,
  ServerCog,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { BrandMark } from "@/app/components/BrandMark";
import { CreateOrganizationForm } from "@/app/components/CreateOrganizationForm";
import { PendingLink } from "@/app/components/PendingLink";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { LanguageSwitcher } from "@/app/components/Language";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import type { OrganizationSummary } from "@/db/organizations";
import { can, type Role } from "@/lib/permissions";

type WorkspaceShellProps = {
  active:
    | "alerts"
    | "audit"
    | "dashboard"
    | "license"
    | "operations"
    | "properties"
    | "privacy"
    | "rules"
    | "team";
  actor: ChatGPTUser;
  children: ReactNode;
  organization: OrganizationSummary;
  organizations: OrganizationSummary[];
};

export function WorkspaceShell({
  active,
  actor,
  children,
  organization,
  organizations,
}: WorkspaceShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const organizationTrigger = useRef<HTMLButtonElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const wasMobileOpen = useRef(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<"organization" | "profile" | null>(
    null,
  );
  const [changingOrganizationId, setChangingOrganizationId] = useState<
    string | null
  >(null);
  const [organizationError, setOrganizationError] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  useEffect(() => {
    setOpenMenu(null);
    setMobileMenuOpen(false);
    setCreatingWorkspace(false);
  }, [pathname, organization.id]);

  useEffect(() => {
    if (mobileMenuOpen) sidebar.current?.querySelector<HTMLButtonElement>(".mobile-menu-close")?.focus();
    else if (wasMobileOpen.current) mobileTrigger.current?.focus();
    wasMobileOpen.current = mobileMenuOpen;
  }, [mobileMenuOpen]);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 760px)");
    const closeOnDesktop = () => { if (!viewport.matches) setMobileMenuOpen(false); };
    viewport.addEventListener("change", closeOnDesktop);
    return () => viewport.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!openMenu && !mobileMenuOpen) return;
    function escapeMenu(event: globalThis.KeyboardEvent) {
      if (event.key === "Tab" && mobileMenuOpen) {
        const controls = Array.from(sidebar.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])
          .filter((control) => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      if (openMenu) {
        (openMenu === "organization" ? organizationTrigger : profileTrigger).current?.focus();
        setOpenMenu(null);
        setCreatingWorkspace(false);
      } else {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("keydown", escapeMenu);
    return () => document.removeEventListener("keydown", escapeMenu);
  }, [openMenu, mobileMenuOpen]);
  const canReadRules = can(organization.role as Role, "rules.read");
  const canManageMembers = can(
    organization.role as Role,
    "membership.manage",
  );
  const canReadAudit = can(organization.role as Role, "audit.read");
  const canReadOperations = can(organization.role as Role, "operations.read");
  const canManagePrivacy = can(organization.role as Role, "data.export");
  const sectionLabel = {
    dashboard: "Resumen", properties: "Viviendas", alerts: "Avisos",
    rules: "Reglas y trazas", team: "Equipo", audit: "Auditoría",
    operations: "Estado operativo", privacy: "Datos y privacidad", license: "Licencia y plan",
  }[active];

  async function changeOrganization(organizationId: string) {
    if (
      organizationId === organization.id ||
      changingOrganizationId !== null
    ) {
      setOpenMenu(null);
      setCreatingWorkspace(false);
      return;
    }

    setChangingOrganizationId(organizationId);
    setOrganizationError("");

    try {
      const response = await fetch("/api/organizations/active", {
        body: JSON.stringify({ organizationId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("No se pudo cambiar de espacio");
      setOpenMenu(null);
      setCreatingWorkspace(false);
      router.push("/app");
      router.refresh();
    } catch {
      setOrganizationError(
        "No hemos podido cambiar de espacio. Inténtalo de nuevo.",
      );
    } finally {
      setChangingOrganizationId(null);
    }
  }

  return (
    <div className="workspace-shell">
      <a className="workspace-skip-link" href="#workspace-content"><I18nText>Saltar al contenido</I18nText></a>
      <LocalizedControl as="aside" ref={sidebar} id="workspace-navigation" role={mobileMenuOpen ? "dialog" : undefined} aria-modal={mobileMenuOpen ? true : undefined} aria-label={mobileMenuOpen ? "Menú de navegación" : undefined} className={`workspace-sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <LocalizedControl as="button"
          aria-label="Cerrar menú"
          className="mobile-menu-close"
          onClick={() => setMobileMenuOpen(false)}
          type="button"
        >
          <X aria-hidden="true" />
        </LocalizedControl>
        <Link className="workspace-brand" href="/">
          <BrandMark />
          <span><I18nText>Expediente VV</I18nText></span>
        </Link>
        <LocalizedControl as="nav" aria-label="Navegación principal" className="workspace-nav">
          <span className="nav-label"><I18nText>Espacio de trabajo</I18nText></span>
          <PendingLink
            aria-current={active === "dashboard" ? "page" : undefined}
            className={`nav-item ${active === "dashboard" ? "active" : ""}`}
            href="/app"
          >
            <Home aria-hidden="true" /><I18nText> Resumen
          </I18nText></PendingLink>
          <PendingLink
            aria-current={active === "properties" ? "page" : undefined}
            className={`nav-item ${active === "properties" ? "active" : ""}`}
            href="/app/properties"
          >
            <Building2 aria-hidden="true" /><I18nText> Viviendas
          </I18nText></PendingLink>
          <PendingLink
            aria-current={active === "alerts" ? "page" : undefined}
            className={`nav-item ${active === "alerts" ? "active" : ""}`}
            href="/app/alerts"
          >
            <Bell aria-hidden="true" /><I18nText> Avisos
          </I18nText></PendingLink>
          <div className="nav-divider" />
          <span className="nav-label"><I18nText>Administración</I18nText></span>
          {canReadRules ? (
            <PendingLink
              aria-current={active === "rules" ? "page" : undefined}
              className={`nav-item ${active === "rules" ? "active" : ""}`}
              href="/app/rules"
            >
              <Scale aria-hidden="true" /><I18nText> Reglas y trazas
            </I18nText></PendingLink>
          ) : null}
          {canManageMembers ? (
            <PendingLink
              aria-current={active === "team" ? "page" : undefined}
              className={`nav-item ${active === "team" ? "active" : ""}`}
              href="/app/team"
            >
              <UsersRound aria-hidden="true" /><I18nText> Equipo
            </I18nText></PendingLink>
          ) : null}
          {canReadAudit ? (
            <PendingLink
              aria-current={active === "audit" ? "page" : undefined}
              className={`nav-item ${active === "audit" ? "active" : ""}`}
              href="/app/audit"
            >
              <History aria-hidden="true" /><I18nText> Auditoría
            </I18nText></PendingLink>
          ) : null}
          {canReadOperations ? (
            <PendingLink
              aria-current={active === "operations" ? "page" : undefined}
              className={`nav-item ${active === "operations" ? "active" : ""}`}
              href="/app/operations"
            >
              <ServerCog aria-hidden="true" /><I18nText> Estado operativo
            </I18nText></PendingLink>
          ) : null}
          {canManagePrivacy ? (
            <PendingLink
              aria-current={active === "privacy" ? "page" : undefined}
              className={`nav-item ${active === "privacy" ? "active" : ""}`}
              href="/app/privacy"
            >
              <ShieldCheck aria-hidden="true" /><I18nText> Datos y privacidad
            </I18nText></PendingLink>
          ) : null}
          <PendingLink aria-current={active === "license" ? "page" : undefined} className={`nav-item ${active === "license" ? "active" : ""}`} href="/app/license"><KeyRound aria-hidden="true" /><I18nText>Licencia y plan</I18nText></PendingLink>
        </LocalizedControl>
        <div className="sidebar-disclaimer">
          <Info aria-hidden="true" />
          <p><I18nText>
            Estados orientativos. La herramienta no certifica la legalidad.
          </I18nText></p>
        </div>
      </LocalizedControl>
      {mobileMenuOpen ? (
        <LocalizedControl as="button"
          aria-label="Cerrar menú al tocar fuera"
          className="mobile-menu-backdrop"
          tabIndex={-1}
          onClick={() => setMobileMenuOpen(false)}
          type="button"
        />
      ) : null}

      <main className="workspace-main" inert={mobileMenuOpen || undefined}>
        <header className="workspace-topbar">
          <LanguageSwitcher />
          <LocalizedControl as="button"
            ref={mobileTrigger}
            aria-expanded={mobileMenuOpen}
            aria-controls="workspace-navigation"
            aria-label="Abrir menú"
            className="mobile-menu"
            onClick={() => setMobileMenuOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" />
          </LocalizedControl>
          <div className="workspace-location"><span><I18nText>Espacio profesional</I18nText></span><strong><I18nText>{sectionLabel}</I18nText></strong></div>
          <div className="topbar-menu-wrap organization-menu-wrap">
            <button
              ref={organizationTrigger}
              aria-controls="organization-menu"
              aria-expanded={openMenu === "organization"}
              className="organization-switcher"
              onClick={() => {
                setCreatingWorkspace(false);
                setOpenMenu((current) =>
                  current === "organization" ? null : "organization",
                );
              }}
              type="button"
            >
              <span className="organization-avatar" aria-hidden="true">
                {organization.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="organization-switcher-copy">
                <span className="topbar-label"><I18nText>Trabajando en</I18nText></span>
                <strong>{organization.name}</strong>
              </span>
              <ChevronDown aria-hidden="true" className="switcher-chevron" />
            </button>
            {openMenu === "organization" ? (
              <div
                className="topbar-popover organization-popover"
                id="organization-menu"
              >
                <div className="popover-heading">
                  <span><I18nText>Tus espacios</I18nText></span>
                  <small><I18nText>
                    Cada uno mantiene separados sus viviendas, documentos,
                    equipo y permisos.
                  </I18nText></small>
                </div>
                <div className="organization-options">
                  {organizations.map((candidate) => {
                    const selected = candidate.id === organization.id;
                    const changing =
                      changingOrganizationId === candidate.id;
                    return (
                      <button
                        aria-current={selected ? "true" : undefined}
                        className="organization-option"
                        disabled={changingOrganizationId !== null}
                        key={candidate.id}
                        onClick={() => changeOrganization(candidate.id)}
                        type="button"
                      >
                        <span className="organization-option-avatar">
                          {candidate.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>{candidate.name}</strong>
                          <small><I18nText>{roleLabel(candidate.role)}</I18nText></small>
                        </span>
                        {changing ? (
                          <span className="menu-spinner" />
                        ) : selected ? (
                          <Check aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {creatingWorkspace ? (
                  <CreateOrganizationForm
                    compact
                    onCancel={() => setCreatingWorkspace(false)}
                    onCreated={(createdOrganization) =>
                      changeOrganization(createdOrganization.id)
                    }
                  />
                ) : (
                  <div className="workspace-create-entry">
                    <button
                      className="workspace-create-trigger"
                      disabled={changingOrganizationId !== null}
                      onClick={() => {
                        setOrganizationError("");
                        setCreatingWorkspace(true);
                      }}
                      type="button"
                    >
                      <span aria-hidden="true">
                        <FolderPlus />
                      </span>
                      <span>
                        <strong><I18nText>Crear otro espacio</I18nText></strong>
                        <small><I18nText>Empieza vacío y separado del actual</I18nText></small>
                      </span>
                    </button>
                  </div>
                )}
                {organizationError ? (
                  <p className="popover-error" role="alert">
                    {organizationError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <PendingLink
              aria-label="Añadir vivienda"
              className="icon-button"
              href="/app/properties/new"
            >
              <Plus aria-hidden="true" />
            </PendingLink>
            <PendingLink
              aria-current={active === "alerts" ? "page" : undefined}
              aria-label="Abrir avisos operativos"
              className="icon-button notification-button"
              href="/app/alerts"
            >
              <Bell aria-hidden="true" />
            </PendingLink>
            <div className="topbar-menu-wrap profile-menu-wrap">
              <LocalizedControl as="button"
                ref={profileTrigger}
                aria-controls="profile-menu"
                aria-expanded={openMenu === "profile"}
                aria-label={`Abrir perfil de ${actor.displayName}`}
                className="user-avatar"
                onClick={() => {
                  setCreatingWorkspace(false);
                  setOpenMenu((current) =>
                    current === "profile" ? null : "profile",
                  );
                }}
                type="button"
              >
                {actor.displayName.slice(0, 1).toUpperCase()}
              </LocalizedControl>
              {openMenu === "profile" ? (
                <div className="topbar-popover profile-popover" id="profile-menu">
                  <LanguageSwitcher />
                  <div className="profile-summary">
                    <span><UserRound aria-hidden="true" /></span>
                    <div>
                      <strong>{actor.displayName}</strong>
                      <small>{actor.email}</small>
                    </div>
                  </div>
                  <div className="profile-context">
                    <span>{organization.name}</span>
                    <small><I18nText>{roleLabel(organization.role)}</I18nText></small>
                  </div>
                  <a
                    className="profile-signout"
                    href="/signout-with-chatgpt?return_to=%2F"
                  >
                    <LogOut aria-hidden="true" /><I18nText> Cerrar sesión
                  </I18nText></a>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        {openMenu ? (
          <LocalizedControl as="button"
            aria-label="Cerrar menú"
            className="topbar-menu-backdrop"
            onClick={() => {
              setOpenMenu(null);
              setCreatingWorkspace(false);
            }}
            type="button"
          />
        ) : null}

        <div id="workspace-content" tabIndex={-1}>{children}</div>

        <LocalizedControl as="nav" aria-label="Navegación móvil" className="mobile-bottom-nav">
          <PendingLink aria-current={active === "dashboard" ? "page" : undefined} href="/app">
            <Home aria-hidden="true" /><I18nText> Inicio
          </I18nText></PendingLink>
          <PendingLink
            aria-current={active === "properties" ? "page" : undefined}
            href="/app/properties"
          >
            <Building2 aria-hidden="true" /><I18nText> Viviendas
          </I18nText></PendingLink>
          <PendingLink aria-label="Añadir vivienda" className="mobile-add" href="/app/properties/new">
            <Plus aria-hidden="true" />
          </PendingLink>
          <PendingLink aria-current={active === "alerts" ? "page" : undefined} href="/app/alerts">
            <Bell aria-hidden="true" /><I18nText> Avisos
          </I18nText></PendingLink>
        </LocalizedControl>
      </main>
    </div>
  );
}

function roleLabel(role: OrganizationSummary["role"]) {
  return {
    manager: "Gestor/a",
    organization_admin: "Administrador/a",
    owner: "Propietario/a",
    professional: "Profesional",
  }[role];
}
