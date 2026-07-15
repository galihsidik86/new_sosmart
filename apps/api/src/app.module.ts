import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
import { TenancyModule } from './common/tenancy/tenancy.module.js';
import { SequenceModule } from './common/sequence/sequence.module.js';
import { ExcelModule } from './common/excel/excel.module.js';
import { PdfModule } from './common/pdf/pdf.module.js';
import { GlConfigModule } from './common/gl-config/gl-config.module.js';
import { CabangScopeModule } from './common/cabang-scope/cabang-scope.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';
import { CabangModule } from './modules/cabang/cabang.module.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { ItemsModule } from './modules/items/items.module.js';
import { VendorsModule } from './modules/vendors/vendors.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { PeriodsModule } from './modules/periods/periods.module.js';
import { JournalsModule } from './modules/journals/journals.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { SalesModule } from './modules/sales/sales.module.js';
import { PurchasesModule } from './modules/purchases/purchases.module.js';
import { CashBankModule } from './modules/cashbank/cashbank.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { AdjustmentsModule } from './modules/adjustments/adjustments.module.js';
import { AsetModule } from './modules/aset/aset.module.js';
import { BuktiPotongModule } from './modules/bukti-potong/bukti-potong.module.js';
import { PayrollModule } from './modules/payroll/payroll.module.js';
import { SptModule } from './modules/spt/spt.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { GlConfigControllerModule } from './modules/gl-config/gl-config-controller.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { Pph23TarifModule } from './modules/pph23-tarif/pph23-tarif.module.js';
import { IndustriModule } from './modules/industri/industri.module.js';
import { BankReconciliationModule } from './modules/bank-reconciliation/bank-reconciliation.module.js';
import { ApprovalModule } from './modules/approval/approval.module.js';
import { ConsolidationModule } from './modules/consolidation/consolidation.module.js';
import { OpeningBalanceModule } from './modules/opening-balance/opening-balance.module.js';
import { FiscalYearClosingModule } from './modules/fiscal-year/fiscal-year-closing.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { HealthController } from './modules/health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    PrismaModule,
    TenancyModule,
    SequenceModule,
    ExcelModule,
    PdfModule,
    GlConfigModule,
    CabangScopeModule,
    AuthModule,
    TenantsModule,
    CabangModule,
    AccountsModule,
    ItemsModule,
    VendorsModule,
    CustomersModule,
    PeriodsModule,
    JournalsModule,
    FiscalYearClosingModule,
    LedgerModule,
    SalesModule,
    PurchasesModule,
    CashBankModule,
    InventoryModule,
    AdjustmentsModule,
    AsetModule,
    BuktiPotongModule,
    PayrollModule,
    SptModule,
    ReportsModule,
    GlConfigControllerModule,
    UsersModule,
    ProjectsModule,
    Pph23TarifModule,
    IndustriModule,
    BankReconciliationModule,
    ApprovalModule,
    ConsolidationModule,
    OpeningBalanceModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
