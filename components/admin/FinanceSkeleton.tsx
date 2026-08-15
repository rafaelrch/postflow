export default function FinanceSkeleton() {
  return (
    <div className="admin-finance-sections admin-finance-skeleton" aria-label="Carregando financeiro">
      {[0, 1, 2].map((section) => <section key={section}>{[0, 1, 2, 3].map((card) => <span key={card} />)}</section>)}
    </div>
  );
}
