import { get_widen_content_controller } from '../controller/widen.controller.js';

export default async function handler(req, res) {
  return get_widen_content_controller(req, res);
}