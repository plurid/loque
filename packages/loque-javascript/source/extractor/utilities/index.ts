// #region imports
    // #region external
    import Extractor from '../objects/Extractor';

    import {
        LocatorStatements,
    } from '#locator/index';
    // #endregion external
// #endregion imports



// #region module
const handleExtraction = <E, D>(
    locator: string | LocatorStatements,
    data: D,
): E => {
    const extractor = new Extractor<D>(
        locator,
        data,
    );
    const result: E = extractor.extract<E>();

    return result;
}
// #endregion module



// #region exports
export {
    handleExtraction,
};
// #endregion exports
