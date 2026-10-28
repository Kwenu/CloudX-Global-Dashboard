import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { ThemedToaster } from './components/layout/ThemedToaster';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { ClientsPage } from './pages/ClientsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentDetailPage } from './pages/DocumentDetailPage';
import { DocumentEditorPage } from './pages/DocumentEditorPage';
import { DocumentHistoryPage } from './pages/DocumentHistoryPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { LoginPage } from './pages/LoginPage';
import { MaintenanceDetailPage } from './pages/MaintenanceDetailPage';
import { MaintenancePage } from './pages/MaintenancePage';
import { PaymentsPage } from './pages/PaymentsPage';
import { QuotationsPage } from './pages/QuotationsPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
              element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
              }>
              
            <Route index element={<DashboardPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/new" element={<DocumentEditorPage key="new-invoice" kind="invoice" />} />
            <Route path="invoices/:id" element={<DocumentDetailPage kind="invoice" />} />
            <Route path="invoices/:id/edit" element={<DocumentEditorPage kind="invoice" />} />
            <Route path="quotations" element={<QuotationsPage />} />
            <Route path="quotations/new" element={<DocumentEditorPage key="new-quotation" kind="quotation" />} />
            <Route path="quotations/:id" element={<DocumentDetailPage kind="quotation" />} />
            <Route path="quotations/:id/edit" element={<DocumentEditorPage kind="quotation" />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="clients/:id" element={<ClientDetailPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="maintenance/:id" element={<MaintenanceDetailPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="documents" element={<DocumentHistoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/:section" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ThemedToaster />
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>);

}