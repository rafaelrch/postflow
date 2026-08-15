export default function CustomersSkeleton() {
  return (
    <div className="admin-customers-skeleton" aria-label="Carregando clientes">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index}><span /><span /><span /><span /></div>
      ))}
    </div>
  );
}
