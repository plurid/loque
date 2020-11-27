// #region imports
    // #region external
    import Extractor from '../objects/Extractor';

    import {
        LocatorStatements,
    } from '#locator/index';
    // #endregion external
// #endregion imports



// #region module
const handleExtraction = (
    locator: string | LocatorStatements,
    data: any,
) => {
    const extractor = new Extractor(
        locator,
        data,
    );
    const result = extractor.extract();

    return result;
}
// #endregion module



// #region exports
export {
    handleExtraction,
};
// #endregion exports
