/**
 * Группировка массива по ключу
 * @param array
 * @param keyFn
 * @returns {*}
 */
function groupBy(array, keyFn) {
    return array.reduce((acc, item) => {
        const key = keyFn(item);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

/**
 * Анализ последовательности чисел на устойчивость, возрастание и убывание
 * @param sequence
 * @param tolerance
 * @returns {{isIncreasing: boolean, isDecreasing: boolean, isStable: boolean}}
 */
function analyzeSequence(sequence, tolerance = 0.05) {
    const trends = {
        isStable: true,
        isIncreasing: false,
        isDecreasing: false,
    };

    if (sequence.length < 2) {
        return trends; // Для последовательностей длиной меньше 2 невозможно определить тренды
    }

    const start = sequence[0];
    const end = sequence[sequence.length - 1];
    const totalChange = end - start;

    // Проверяем стабильность: каждое значение должно быть в пределах tolerance от предыдущего
    for (let i = 1; i < sequence.length; i++) {
        const relativeChange = Math.abs(sequence[i] - sequence[i - 1]) / Math.abs(sequence[i - 1]);
        if (relativeChange > tolerance) {
            trends.isStable = false;
            break;
        }
    }

    // Проверяем рост и убывание
    trends.isIncreasing = totalChange > 0;
    trends.isDecreasing = totalChange < 0;

    return trends;
}


/***
 * Вычисление среднего значения
 * @param values
 * @returns {number}
 */
function calculateAverage(values) {
    const sum = values.reduce((acc, value) => acc + value, 0);
    return sum / values.length || 0;
}

/**
 * Получение N элементов с наибольшим значением ключа
 * @param array
 * @param key
 * @param n
 * @returns {*}
 */
function getTopN(array, key, n) {
    return array.sort((a, b) => b[key] - a[key]).slice(0, n);
}

/**
 * Вычисление бонусов по специальным условиям
 * @param data
 * @param options {{accumulateMetrics: ((function(*, *, *): *)|*), calculateProfit: ((function(*, *): number)|*)}}
 * @param bonusFunctions
 * @returns {*}
 */
function calculateSpecialBonuses(data, options, bonusFunctions) {
    const { calculateProfit, accumulateMetrics } = options;
    // Группировка данных
    const recordsBySeller = groupBy(data.purchase_records, record => record.seller_id);
    const recordsByCustomer = groupBy(data.purchase_records, record => record.customer_id);
    const recordsByProduct = groupBy(data.purchase_records.flatMap(record => record.items), item => item.sku);

    // Накопительная статистика
    const stats = accumulateMetrics(data.purchase_records, calculateProfit, data.products);

    // Вызов функций для расчёта бонусов
    return bonusFunctions.map(func =>
        func({
            stats,
            recordsBySeller,
            recordsByCustomer,
            recordsByProduct,
            sellers: data.sellers,
            customers: data.customers,
            products: data.products,
            calculateProfit
        })
    );
}

// 1. Продавец, привлекший лучшего покупателя
function bonusBestCustomer({ stats }) {
    const bestCustomer = Object.entries(stats.customers).reduce((max, [id, data]) =>
        data.revenue > (max?.revenue || 0) ? { id, ...data } : max, null);

    const sellerId = Array.from(bestCustomer.sellers).reduce((topSeller, sellerId) => {
        const revenue = stats.sellers[sellerId]?.revenue || 0;
        return revenue > (topSeller?.revenue || 0) ? { sellerId, revenue } : topSeller;
    }, null).sellerId;

    return {
        category: "Best Customer Seller",
        seller_id: sellerId,
        bonus: +(bestCustomer.revenue * 0.05).toFixed(2),
    };
}

// 2. Продавец, лучше всего удерживающий покупателя
function bonusCustomerRetention({ stats }) {
    const bestRetention = Object.entries(stats.sellers).reduce((best, [sellerId, data]) => {
        const customerCounts = Array.from(data.customers).map(customerId =>
            stats.customers[customerId]?.revenue || 0);
        const maxCustomerRevenue = Math.max(...customerCounts);

        return maxCustomerRevenue > (best?.revenue || 0) ? { sellerId, revenue: maxCustomerRevenue } : best;
    }, null);

    return {
        category: "Best Customer Retention",
        seller_id: bestRetention.sellerId,
        bonus: 1000,
    };
}

// 3. Продавец, привлекший клиента с наибольшим чеком
function bonusLargestSingleSale({ recordsBySeller }) {
    const largestSale = Object.entries(recordsBySeller).reduce((max, [sellerId, records]) => {
        const largestRecord = records.reduce((recordMax, record) =>
            record.total_amount > (recordMax?.total_amount || 0) ? record : recordMax, null);
        return largestRecord?.total_amount > (max?.total_amount || 0) ? largestRecord : max;
    }, null);

    return {
        category: "Largest Single Sale",
        seller_id: largestSale.seller_id,
        bonus: +(largestSale.total_amount * 0.1).toFixed(2),
    };
}

// 4. Продавец с наибольшей средней прибылью
function bonusHighestAverageProfit({ stats }) {
    const bestSeller = Object.entries(stats.sellers).reduce((max, [sellerId, data]) => {
        const avgProfit = data.profit / (data.items.length || 1);
        return avgProfit > (max?.avgProfit || 0) ? { sellerId, avgProfit } : max;
    }, null);

    return {
        category: "Highest Average Profit",
        seller_id: bestSeller.sellerId,
        bonus: +(bestSeller.avgProfit * 0.1).toFixed(2),
    };
}

// 5. Продавец со стабильно растущей средней прибылью
function bonusStableGrowth({ recordsBySeller, calculateProfit, products }) {
    const bestSeller = Object.entries(recordsBySeller).reduce((best, [sellerId, records]) => {
        const monthlyProfits = groupBy(records, record => record.date.slice(0, 7));
        const monthlyAverages = Object.entries(monthlyProfits)
            .sort(([a], [b]) => new Date(a) - new Date(b))
            .map(([month, records]) =>
                calculateAverage(records.flatMap(record =>
                    record.items.map(item => calculateProfit(item, products.find(p => p.sku === item.sku))))));

        const { isStable, isIncreasing } = analyzeSequence(monthlyAverages, 0.05);

        if (isStable && isIncreasing) {
            const avgProfit = calculateAverage(monthlyAverages);
            return avgProfit > (best?.avgProfit || 0) ? { sellerId, avgProfit } : best;
        }

        return best;
    }, null);

    return {
        category: "Stable Growth",
        seller_id: bestSeller?.sellerId,
        bonus: +(bestSeller ? bestSeller.avgProfit * 0.15 : 0).toFixed(2),
    };
}

/**
 * Простой расчёт прибыли
 * @param item
 * @param product
 * @returns {number}
 */
function simpleProfit(item, product) {
    return item.sale_price * item.quantity * (1 - item.discount / 100) - product.purchase_price * item.quantity;
}

/**
 * Накопительное вычисление прибыли, выручки и других метрик
 * @param records
 * @param calculateProfit
 * @param products
 * @returns {*}
 */
function baseMetrics(records, calculateProfit, products) {
    return records.reduce((acc, record) => {
        const sellerId = record.seller_id;
        const customerId = record.customer_id;

        if (!acc.sellers[sellerId]) acc.sellers[sellerId] = { revenue: 0, profit: 0, items: [], customers: new Set() };
        if (!acc.customers[customerId]) acc.customers[customerId] = { revenue: 0, profit: 0, sellers: new Set() };

        record.items.forEach(item => {
            const product = products.find(p => p.sku === item.sku);
            const profit = calculateProfit(item, product);

            // Обновление статистики продавца
            acc.sellers[sellerId].revenue += item.sale_price * item.quantity * (1 - item.discount / 100);
            acc.sellers[sellerId].profit += profit;
            acc.sellers[sellerId].items.push(item);
            acc.sellers[sellerId].customers.add(customerId);

            // Обновление статистики покупателя
            acc.customers[customerId].revenue += item.sale_price * item.quantity * (1 - item.discount / 100);
            acc.customers[customerId].profit += profit;
            acc.customers[customerId].sellers.add(sellerId);

            // Обновление статистики по продуктам
            if (!acc.products[item.sku]) acc.products[item.sku] = { quantity: 0, revenue: 0 };
            acc.products[item.sku].quantity += item.quantity;
            acc.products[item.sku].revenue += item.sale_price * item.quantity * (1 - item.discount / 100);
        });

        return acc;
    }, { sellers: {}, customers: {}, products: {} });
}


function calculateSimpleRevenue(purchase, _product) {
   // @TODO: Расчёт прибыли от операции
   const discount =   1 - (purchase.discount / 100);
   return purchase.sale_price * purchase.quantity * discount;
}

function calculateBonusByProfit(index, total, seller) {
    // @TODO: Расчёт бонуса от позиции в рейтинге
    if(index === 0){
        return seller.profit * 0.15;
    } else if (index === 1 || index === 2){
        return seller.profit * 0.10;
    } else if(index === -1){
        return 0
    } else {
        return seller.profit * 0.05;
    }
}

function analyzeSalesData(data, options) {
    // @TODO: Проверка входных данных
    if(!data
        || !Array.isArray(data.customers)
        || !Array.isArray(data.products)
        || !Array.isArray(data.sellers)
        || !Array.isArray(data.purchase_records)
        || data.customers.length === 0
        || data.products.length === 0 
        || data.sellers.length === 0
        || data.purchase_records.length === 0
    ) {
        throw new Error('Некорректные входные данные');
    }

    // @TODO: Проверка наличия опций
    if(typeof options !== "object" || options === null){
        throw new Error('Опции должны быть объектом');
    }

    const {calculateRevenue, calculateBonus } = options;
    if (!calculateRevenue || !calculateBonus) {
        throw new Error('Чего-то не хватает');
    }
    if(typeof calculateRevenue !== "function" || typeof calculateBonus !== "function"){
        throw new Error('Некорректные переменные:требуется функция');
    }

    // @TODO: Подготовка промежуточных данных для сбора статистики
    const sellerStats = data.sellers.map(sellers => ({
        sellerId: sellers.id,
        firstName: sellers.first_name,
        lastName: sellers.last_name,
        startDate: sellers.start_date,
        sellerPosition: sellers.position,
        revenue: 0,
        profit: 0,
        sales_count: 0,
        products_sold: {},
        bonus: 0,
        top_products: []
    }));

    // @TODO: Индексация продавцов и товаров для быстрого доступа
    const sellerIndex = Object.fromEntries(
        sellerStats.map(seller => [seller.sellerId, seller]) // исправлено
    );
    const productIndex = Object.fromEntries(
        data.products.map(product => [product.sku, product])
    );

    // @TODO: Расчёт выручки и прибыли для каждого продавца
    data.purchase_records.forEach(record => {
        const seller = sellerIndex[record.seller_id];
        if(seller){
            seller.sales_count += 1;
            seller.revenue += record.total_amount;

            record.items.forEach(item => {
                const product = productIndex[item.sku];
                if (product){
                    const cost = product.purchase_price * item.quantity;
                    const revenue = calculateRevenue(item, product);
                    const profit = revenue - cost;

                    seller.profit += profit;

                    if (!seller.products_sold[item.sku]) {
                        seller.products_sold[item.sku] = 0;
                    }
                    seller.products_sold[item.sku] += item.quantity;
                }
            });
        }
    });

    // @TODO: Сортировка продавцов по прибыли
    sellerStats.sort((a,b) => b.profit - a.profit); 

    // @TODO: Назначение премий на основе ранжирования
    sellerStats.forEach((seller, index) => {
        seller.bonus = calculateBonus(seller, index, sellerStats.length);
        seller.top_products = Object.entries(seller.products_sold || {})
            .map(([sku, quantity]) => ({sku, quantity}))
            .sort((a,b) => b.quantity - a.quantity)
            .slice(0,10);
    });

    // @TODO: Подготовка итоговой коллекции с нужными полями
    return sellerStats.map(seller => ({
        seller_id: seller.sellerId,
        name: `${seller.firstName} ${seller.lastName}`,
        revenue: +(seller.revenue || 0).toFixed(2),
        profit: +(seller.profit || 0).toFixed(2),
        sales_count: seller.sales_count || 0,
        top_products: seller.top_products,
        bonus: +(seller.bonus || 0).toFixed(2)
    }));
};