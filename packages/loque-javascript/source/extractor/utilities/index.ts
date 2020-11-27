// #region imports
    // #region external
    import {
        ExtractedLoque,
    } from '../data/interfaces';

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
): ExtractedLoque<E> => {
    const extractor = new Extractor<D>(
        locator,
        data,
    );
    const result = extractor.extract<E>();

    return result;
}
// #endregion module



// #region exports
export {
    handleExtraction,
};
// #endregion exports
