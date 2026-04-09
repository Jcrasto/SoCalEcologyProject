from jobs.weather import WeatherJob
from jobs.electricity import ElectricityJob
from jobs.natural_gas import NaturalGasJob
from jobs.gasoline import GasolineJob
from jobs.air_quality import AirQualityJob
from jobs.unemployment import UnemploymentJob
from jobs.interest_rates import InterestRatesJob
from jobs.market_indexes import MarketIndexesJob
from jobs.world_bank import WorldBankJob

# Registry: source_id → job instance
REGISTRY: dict = {
    job.source_id: job
    for job in [
        WeatherJob(),
        ElectricityJob(),
        NaturalGasJob(),
        GasolineJob(),
        AirQualityJob(),
        UnemploymentJob(),
        InterestRatesJob(),
        MarketIndexesJob(),
        WorldBankJob(),
    ]
}
