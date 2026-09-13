import ProductCard from "./ProductCard";

export default function ProductGrid({ products, emptyLabel = "Aucun produit trouvé." }) {
  if (!products || products.length === 0) {
    return <p className="text-center text-ink/50 py-10">{emptyLabel}</p>;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
